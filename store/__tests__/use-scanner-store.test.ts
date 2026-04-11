import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCheckAvailability = vi.fn();
const mockListDevices = vi.fn();

describe('useScannerStore', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockCheckAvailability.mockResolvedValue({ available: true });
    mockListDevices.mockResolvedValue({
      devices: [{ name: 'Test Scanner', driver: 'twain' }],
    });
  });

  function setupElectronAPI() {
    window.electronAPI = {
      isElectron: true,
      platform: 'win32',
      openExternal: vi.fn(),
      onAuthCallback: vi.fn(),
      startAuthServer: vi.fn(),
      scanner: {
        checkAvailability: mockCheckAvailability,
        listDevices: mockListDevices,
        scan: vi.fn(),
        readScanFile: vi.fn(),
        cleanupScanFile: vi.fn(),
        launchOnTouchLite: vi.fn(),
        importFromFolder: vi.fn(),
        importFromDrive: vi.fn(),
      },
      updater: {} as any,
    } as any;
  }

  async function getStore() {
    const { useScannerStore } = await import('../use-scanner-store');
    return useScannerStore;
  }

  describe('initialize()', () => {
    it('Electron 환경에서 IPC 호출하여 스캐너 상태 캐싱', async () => {
      setupElectronAPI();
      const store = await getStore();

      await store.getState().initialize();

      expect(mockCheckAvailability).toHaveBeenCalledOnce();
      expect(mockListDevices).toHaveBeenCalledOnce();
      expect(store.getState().isElectron).toBe(true);
      expect(store.getState().available).toBe(true);
      expect(store.getState().devices).toHaveLength(1);
      expect(store.getState().devices[0].name).toBe('Test Scanner');
    });

    it('이미 초기화된 경우 중복 호출하지 않음', async () => {
      setupElectronAPI();
      const store = await getStore();

      await store.getState().initialize();
      await store.getState().initialize();

      expect(mockCheckAvailability).toHaveBeenCalledOnce();
    });

    it('웹 환경에서는 IPC 호출 없이 종료', async () => {
      window.electronAPI = undefined;
      const store = await getStore();

      await store.getState().initialize();

      expect(mockCheckAvailability).not.toHaveBeenCalled();
      expect(store.getState().isElectron).toBe(false);
      expect(store.getState().available).toBe(false);
    });

    it('디바이스가 없으면 available이 false', async () => {
      setupElectronAPI();
      mockListDevices.mockResolvedValue({ devices: [] });
      const store = await getStore();

      await store.getState().initialize();

      expect(store.getState().available).toBe(false);
      expect(store.getState().reason).toBe('no-device-found');
    });

    it('권한 에러 시 available이 false이고 reason이 permission-denied', async () => {
      setupElectronAPI();
      mockListDevices.mockResolvedValue({
        devices: [],
        error: { type: 'permission', message: 'Access denied' },
      });
      const store = await getStore();

      await store.getState().initialize();

      expect(store.getState().available).toBe(false);
      expect(store.getState().reason).toBe('permission-denied');
    });
  });

  describe('refreshDevices()', () => {
    it('초기화 후 재조회 수행', async () => {
      setupElectronAPI();
      const store = await getStore();

      await store.getState().initialize();
      mockListDevices.mockResolvedValue({
        devices: [
          { name: 'Scanner A', driver: 'twain' },
          { name: 'Scanner B', driver: 'wia' },
        ],
      });

      await store.getState().refreshDevices();

      expect(mockListDevices).toHaveBeenCalledTimes(2);
      expect(store.getState().devices).toHaveLength(2);
    });
  });
});
