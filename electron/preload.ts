import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  onAuthCallback: (callback: (code: string) => void) => {
    const handler = (_: unknown, code: string) => callback(code);
    ipcRenderer.on('auth-callback', handler);
    return () => {
      ipcRenderer.removeListener('auth-callback', handler);
    };
  },
});
