import { app, BrowserWindow, shell, protocol, net, ipcMain } from 'electron';
import path from 'path';
import url from 'url';
import { exec } from 'child_process';
import { ScannerService } from './scanner-service';

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
    title: 'AI 채점기',
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

app.whenReady().then(() => {
  // app:// 프로토콜 핸들러: out/ 디렉토리의 정적 파일 서빙
  protocol.handle('app', (request) => {
    const requestUrl = new URL(request.url);
    let filePath = requestUrl.pathname;

    // 기본 파일
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }

    const outDir = path.join(__dirname, '..', 'out');
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

  // Scanner IPC handlers
  ipcMain.handle('scanner:check-availability', () => {
    return scannerService.isAvailable();
  });

  ipcMain.handle('scanner:list-devices', async () => {
    return scannerService.listDevices();
  });

  ipcMain.handle('scanner:scan', async (_event, options) => {
    return scannerService.scan(options);
  });

  ipcMain.handle('scanner:read-scan-file', (_event, filePath: string) => {
    return scannerService.readScanFile(filePath);
  });

  ipcMain.handle('scanner:cleanup-scan-file', (_event, filePath: string) => {
    return scannerService.cleanupScanFile(filePath);
  });

  // 이전 세션의 잔여 임시 파일 정리
  scannerService.cleanup();

  createWindow();
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
