interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  openExternal: (url: string) => Promise<void>;
  onAuthCallback: (callback: (code: string) => void) => () => void;
  startAuthServer: () => Promise<number>;
  scanner: {
    checkAvailability: () => Promise<{ available: boolean; reason?: string; path?: string }>;
    listDevices: () => Promise<{ devices: { name: string; driver: string; driveLetter?: string; onTouchLitePath?: string; hasImageFiles?: boolean }[]; error?: { type: string; message: string } }>;
    scan: (options?: {
      device?: string;
      dpi?: number;
      colorMode?: 'color' | 'gray' | 'bw';
      format?: 'pdf' | 'jpeg' | 'png';
      source?: 'glass' | 'feeder' | 'duplex';
    }) => Promise<{ filePath: string; mimeType: string; additionalFiles?: string[] }>;
    readScanFile: (filePath: string) => Promise<string>;
    cleanupScanFile: (filePath: string) => Promise<void>;
    launchOnTouchLite: (exePath: string) => Promise<void>;
    importFromFolder: () => Promise<{ files: Array<{ filePath: string; mimeType: string }> }>;
    importFromDrive: (driveLetter: string) => Promise<{ files: Array<{ filePath: string; mimeType: string }> }>;
  };
  updater: {
    checkForUpdate: () => Promise<unknown>;
    downloadUpdate: () => Promise<unknown>;
    installUpdate: () => Promise<void>;
    onUpdateAvailable: (cb: (info: unknown) => void) => () => void;
    onUpdateProgress: (cb: (progress: unknown) => void) => () => void;
    onUpdateDownloaded: (cb: () => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

/**
 * Electron 환경인지 감지 (결과를 캐싱하여 한 번만 판별)
 */
let _cached: boolean | null = null;

export function isElectron(): boolean {
  if (_cached !== null) return _cached;
  _cached = typeof window !== 'undefined' && !!window.electronAPI;
  return _cached;
}

/** 테스트용: 캐시 초기화 */
export function _resetIsElectronCache(): void {
  _cached = null;
}
