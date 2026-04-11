import { app, BrowserWindow, shell, protocol, net, ipcMain, dialog, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import url from 'url';
import { exec } from 'child_process';
import { ScannerService } from './scanner-service';
import { createAuthCallbackServer } from './auth-server';
import { checkForUIUpdate, getOutDir } from './hot-update';

const scannerService = new ScannerService();

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

// 딥링크 프로토콜 등록 (개발 모드)
if (isDev) {
  app.setAsDefaultProtocolClient('ai-exam-grader');
}

// Windows/Linux: 싱글 인스턴스 잠금 + 딥링크 처리
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // Windows/Linux에서 딥링크 URL은 argv에 포함됨
    const deepLinkUrl = argv.find((arg) => arg.startsWith('ai-exam-grader://'));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
    // 메인 윈도우 포커스
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// macOS: open-url 이벤트로 딥링크 수신
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

function handleDeepLink(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/auth/callback' || parsed.host === 'auth' ) {
      const code = parsed.searchParams.get('code');
      if (code && mainWindow) {
        mainWindow.webContents.send('auth-callback', code);
      }
    }
  } catch (e) {
    console.error('[DeepLink] Failed to parse URL:', e);
  }
}

// 커스텀 프로토콜 등록 (file:// 대신 app:// 사용)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: isDev ? 'Gradely (dev)' : 'Gradely',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('app://./index.html');
  }

  // 외부 링크는 시스템 브라우저에서 열기
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 숨겨진 DevTools 토글: Shift 5번 연속 입력
  let shiftCount = 0;
  let shiftTimer: NodeJS.Timeout | null = null;
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Shift' && input.type === 'keyDown') {
      shiftCount++;
      if (shiftTimer) clearTimeout(shiftTimer);
      shiftTimer = setTimeout(() => { shiftCount = 0; }, 1500);
      if (shiftCount >= 5) {
        shiftCount = 0;
        mainWindow?.webContents.toggleDevTools();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function openInChrome(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform === 'darwin') {
      exec(`open -a "Google Chrome" "${url}"`, (err) => {
        if (err) {
          shell.openExternal(url).then(resolve).catch(reject);
        } else {
          resolve();
        }
      });
    } else if (process.platform === 'win32') {
      exec(`start chrome "${url}"`, (err) => {
        if (err) {
          shell.openExternal(url).then(resolve).catch(reject);
        } else {
          resolve();
        }
      });
    } else {
      shell.openExternal(url).then(resolve).catch(reject);
    }
  });
}

app.whenReady().then(async () => {
  // Hot update: UI 번들 업데이트 체크 (프로덕션 전용)
  if (!isDev) {
    const updated = await checkForUIUpdate();
    if (updated) {
      await session.defaultSession.clearCache();
      console.log('[HotUpdate] Session cache cleared after UI update');
    }
  }

  // app:// 프로토콜 핸들러: out/ 디렉토리의 정적 파일 서빙
  protocol.handle('app', (request) => {
    const requestUrl = new URL(request.url);
    let filePath = requestUrl.pathname;

    // 기본 파일
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }

    const outDir = isDev ? path.join(__dirname, '..', 'out') : getOutDir();
    let fullPath = path.join(outDir, filePath);

    // 보안: out 디렉토리 밖으로 나가지 못하게
    if (!fullPath.startsWith(outDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    // 확장자가 없는 경로는 디렉토리로 간주하여 index.html을 서빙
    // (예: /auth/callback → /auth/callback/index.html)
    if (!path.extname(fullPath)) {
      fullPath = path.join(fullPath, 'index.html');
    }

    return net.fetch(url.pathToFileURL(fullPath).toString());
  });

  // IPC: renderer에서 시스템 브라우저 열기
  ipcMain.handle('open-external', (_event, url: string) => {
    return openInChrome(url);
  });

  // IPC: OAuth 콜백용 임시 localhost 서버 시작
  ipcMain.handle('start-auth-server', async () => {
    const { port } = await createAuthCallbackServer({
      onCode: (code) => {
        if (mainWindow) {
          mainWindow.webContents.send('auth-callback', code);
          mainWindow.focus();
        }
      },
    });
    return port;
  });

  // Scanner IPC handlers
  ipcMain.handle('scanner:check-availability', () => {
    console.log('[Scanner IPC] check-availability 호출');
    const result = scannerService.isAvailable();
    console.log('[Scanner IPC] check-availability 결과:', JSON.stringify(result));
    return result;
  });

  ipcMain.handle('scanner:list-devices', async () => {
    console.log('[Scanner IPC] list-devices 호출');
    const result = await scannerService.listDevices();
    console.log('[Scanner IPC] list-devices 결과:', JSON.stringify(result));
    return result;
  });

  ipcMain.handle('scanner:scan', async (_event, options) => {
    console.log('[Scanner IPC] scan 호출, 옵션:', JSON.stringify(options));
    try {
      const result = await scannerService.scan(options);
      console.log('[Scanner IPC] scan 결과:', JSON.stringify(result));
      return result;
    } catch (err) {
      console.error('[Scanner IPC] scan 에러:', (err as Error).message);
      throw err;
    }
  });

  ipcMain.handle('scanner:read-scan-file', (_event, filePath: string) => {
    console.log('[Scanner IPC] read-scan-file 호출, 경로:', filePath);
    try {
      const base64 = scannerService.readScanFile(filePath);
      console.log('[Scanner IPC] read-scan-file 성공, base64 길이:', base64.length);
      return base64;
    } catch (err) {
      console.error('[Scanner IPC] read-scan-file 에러:', (err as Error).message);
      throw err;
    }
  });

  ipcMain.handle('scanner:cleanup-scan-file', (_event, filePath: string) => {
    console.log('[Scanner IPC] cleanup-scan-file 호출, 경로:', filePath);
    try {
      scannerService.cleanupScanFile(filePath);
      console.log('[Scanner IPC] cleanup-scan-file 성공');
    } catch (err) {
      console.error('[Scanner IPC] cleanup-scan-file 에러:', (err as Error).message);
      throw err;
    }
  });

  // USB 스캐너: Capture OnTouch Lite 실행
  ipcMain.handle('scanner:launch-ontouch-lite', (_event, exePath: string) => {
    console.log('[Scanner IPC] launch-ontouch-lite 호출:', exePath);
    try {
      scannerService.launchOnTouchLite(exePath);
      return { success: true };
    } catch (err) {
      console.error('[Scanner IPC] launch-ontouch-lite 에러:', (err as Error).message);
      throw err;
    }
  });

  // USB 스캐너: 폴더 선택 → 이미지 가져오기
  ipcMain.handle('scanner:import-from-folder', async () => {
    console.log('[Scanner IPC] import-from-folder 호출');
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: '스캔 이미지가 저장된 폴더를 선택하세요',
    });
    if (result.canceled || !result.filePaths[0]) {
      return { files: [] };
    }
    try {
      const importResult = scannerService.importFromFolder(result.filePaths[0]);
      console.log('[Scanner IPC] import-from-folder 결과:', importResult.files.length, '파일');
      return importResult;
    } catch (err) {
      console.error('[Scanner IPC] import-from-folder 에러:', (err as Error).message);
      throw err;
    }
  });

  // USB 스캐너: 드라이브에서 직접 이미지 가져오기
  ipcMain.handle('scanner:import-from-drive', async (_event, driveLetter: string) => {
    console.log('[Scanner IPC] import-from-drive 호출:', driveLetter);
    try {
      const importResult = scannerService.importFromDrive(driveLetter);
      console.log('[Scanner IPC] import-from-drive 결과:', importResult.files.length, '파일');
      return importResult;
    } catch (err) {
      console.error('[Scanner IPC] import-from-drive 에러:', (err as Error).message);
      throw err;
    }
  });

  // 이전 세션의 잔여 임시 파일 정리
  console.log('[Scanner] 앱 시작: 임시 파일 정리');
  scannerService.cleanup();

  // Auto-update IPC handlers
  ipcMain.handle('update:check', () => autoUpdater.checkForUpdates());
  ipcMain.handle('update:download', () => autoUpdater.downloadUpdate());
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());

  createWindow();

  // Auto-updater (프로덕션 전용)
  if (!isDev) {
    autoUpdater.autoDownload = false;
    autoUpdater.checkForUpdates();

    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update-available', info);
    });
    autoUpdater.on('download-progress', (progress) => {
      mainWindow?.webContents.send('update-progress', progress);
    });
    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update-downloaded');
    });
    autoUpdater.on('error', (err) => {
      console.error('[AutoUpdater] Error:', err);
    });
  }
});

app.on('before-quit', () => {
  scannerService.killProcess();
  scannerService.cleanup();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
