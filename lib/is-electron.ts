/**
 * Electron 환경인지 감지
 */
export function isElectron(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as unknown as Record<string, unknown>).electronAPI;
}
