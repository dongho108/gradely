import { app, BrowserWindow, shell, protocol, net } from 'electron';
import path from 'path';
import url from 'url';

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

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

  // 외부 링크는 기본 브라우저에서 열기
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('accounts.google.com') || url.includes('supabase')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500,
          height: 700,
          parent: mainWindow!,
          modal: false,
        },
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
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
    const fullPath = path.join(outDir, filePath);

    // 보안: out 디렉토리 밖으로 나가지 못하게
    if (!fullPath.startsWith(outDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    return net.fetch(url.pathToFileURL(fullPath).toString());
  });

  createWindow();
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
