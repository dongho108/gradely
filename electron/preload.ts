import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  appVersion: () => ipcRenderer.invoke('get-app-version'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  onAuthCallback: (callback: (code: string) => void) => {
    const handler = (_: unknown, code: string) => callback(code);
    ipcRenderer.on('auth-callback', handler);
    return () => {
      ipcRenderer.removeListener('auth-callback', handler);
    };
  },
  startAuthServer: () => ipcRenderer.invoke('start-auth-server'),
  scanner: {
    checkAvailability: () => ipcRenderer.invoke('scanner:check-availability'),
    listDevices: () => ipcRenderer.invoke('scanner:list-devices'),
    scan: (options?: Record<string, unknown>) => ipcRenderer.invoke('scanner:scan', options),
    readScanFile: (filePath: string) => ipcRenderer.invoke('scanner:read-scan-file', filePath),
    cleanupScanFile: (filePath: string) => ipcRenderer.invoke('scanner:cleanup-scan-file', filePath),
    launchOnTouchLite: (exePath: string) => ipcRenderer.invoke('scanner:launch-ontouch-lite', exePath),
    importFromFolder: () => ipcRenderer.invoke('scanner:import-from-folder'),
    importFromDrive: (driveLetter: string) => ipcRenderer.invoke('scanner:import-from-drive', driveLetter),
  },
  updater: {
    checkForUpdate: () => ipcRenderer.invoke('update:check'),
    downloadUpdate: () => ipcRenderer.invoke('update:download'),
    installUpdate: () => ipcRenderer.invoke('update:install'),
    onUpdateAvailable: (cb: (info: unknown) => void) => {
      const handler = (_: unknown, info: unknown) => cb(info);
      ipcRenderer.on('update-available', handler);
      return () => { ipcRenderer.removeListener('update-available', handler); };
    },
    onUpdateProgress: (cb: (progress: unknown) => void) => {
      const handler = (_: unknown, progress: unknown) => cb(progress);
      ipcRenderer.on('update-progress', handler);
      return () => { ipcRenderer.removeListener('update-progress', handler); };
    },
    onUpdateDownloaded: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on('update-downloaded', handler);
      return () => { ipcRenderer.removeListener('update-downloaded', handler); };
    },
  },
});
