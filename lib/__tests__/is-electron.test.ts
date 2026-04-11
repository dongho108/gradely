import { describe, it, expect, beforeEach } from 'vitest';
import { isElectron, _resetIsElectronCache } from '../is-electron';

describe('isElectron', () => {
  beforeEach(() => {
    _resetIsElectronCache();
  });

  it('window.electronAPI가 없으면 false 반환', () => {
    window.electronAPI = undefined;
    expect(isElectron()).toBe(false);
  });

  it('window.electronAPI가 있으면 true 반환', () => {
    _resetIsElectronCache();
    window.electronAPI = { isElectron: true, platform: 'win32' } as any;
    expect(isElectron()).toBe(true);
  });

  it('첫 호출 결과가 캐싱되어 이후 호출에서 재사용', () => {
    _resetIsElectronCache();
    window.electronAPI = { isElectron: true, platform: 'win32' } as any;

    expect(isElectron()).toBe(true);

    // electronAPI를 제거해도 캐싱된 true가 반환되어야 함
    window.electronAPI = undefined;
    expect(isElectron()).toBe(true);
  });
});
