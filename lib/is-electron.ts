interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  openExternal: (url: string) => Promise<void>;
  onAuthCallback: (callback: (code: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

/**
 * Electron 환경인지 감지
 */
export function isElectron(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.electronAPI;
}
