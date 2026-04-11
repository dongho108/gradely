import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockInitialize = vi.fn();
const mockRefreshDevices = vi.fn();

vi.mock('@/store/use-scanner-store', () => ({
  useScannerStore: Object.assign(
    (selector: any) => {
      const state = {
        available: true,
        reason: undefined,
        isElectron: true,
        devices: [{ name: 'Test Scanner', driver: 'twain' }],
        isRefreshing: false,
        initialized: true,
        initialize: mockInitialize,
        refreshDevices: mockRefreshDevices,
      };
      return selector(state);
    },
    {
      getState: () => ({
        available: true,
        reason: undefined,
        isElectron: true,
        devices: [{ name: 'Test Scanner', driver: 'twain' }],
        isRefreshing: false,
        initialized: true,
        initialize: mockInitialize,
        refreshDevices: mockRefreshDevices,
      }),
    }
  ),
}));

import { useScannerAvailability } from '../use-scanner-availability';

describe('useScannerAvailability (스토어 래퍼)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('기존 인터페이스(available, isElectron, devices, reason, isRefreshing, refreshDevices)를 유지', () => {
    const { result } = renderHook(() => useScannerAvailability());

    expect(result.current).toHaveProperty('available');
    expect(result.current).toHaveProperty('isElectron');
    expect(result.current).toHaveProperty('devices');
    expect(result.current).toHaveProperty('reason');
    expect(result.current).toHaveProperty('isRefreshing');
    expect(result.current).toHaveProperty('refreshDevices');
  });

  it('스토어에서 값을 읽어옴', () => {
    const { result } = renderHook(() => useScannerAvailability());

    expect(result.current.available).toBe(true);
    expect(result.current.isElectron).toBe(true);
    expect(result.current.devices).toHaveLength(1);
  });

  it('마운트 시 initialize()를 호출', () => {
    renderHook(() => useScannerAvailability());

    expect(mockInitialize).toHaveBeenCalled();
  });

  it('refreshDevices가 스토어의 refreshDevices를 호출', () => {
    const { result } = renderHook(() => useScannerAvailability());

    result.current.refreshDevices();

    expect(mockRefreshDevices).toHaveBeenCalled();
  });
});
