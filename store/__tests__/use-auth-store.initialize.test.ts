import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockGetSession } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithOAuth: vi.fn(),
      exchangeCodeForSession: vi.fn(),
    },
  },
}));

vi.mock('@/lib/is-electron', () => ({
  isElectron: () => false,
}));

import { useAuthStore } from '../use-auth-store';

describe('useAuthStore.initialize — 세션 검증', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: true });
  });

  it('유효한 세션이면 isAuthenticated: true로 설정한다', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    const mockSession = { user: mockUser, access_token: 'valid-token' };
    mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    useAuthStore.getState().initialize();

    await vi.waitFor(() => {
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(mockUser);
  });

  it('로컬 세션이 없으면 isAuthenticated: false로 설정한다', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    useAuthStore.getState().initialize();

    await vi.waitFor(() => {
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('만료된 세션이면 isAuthenticated: false로 설정한다', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    const mockSession = { user: mockUser, access_token: 'expired-token' };
    mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired', status: 401 },
    });

    useAuthStore.getState().initialize();

    await vi.waitFor(() => {
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  it('getUser() 타임아웃 시 로컬 세션으로 fallback한다', async () => {
    vi.useFakeTimers();
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    const mockSession = { user: mockUser, access_token: 'valid-token' };
    mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
    // getUser()가 resolve되지 않는 상황 (무한 대기)
    mockGetUser.mockReturnValue(new Promise(() => {}));

    useAuthStore.getState().initialize();

    // getSession은 microtask이므로 flush
    await vi.advanceTimersByTimeAsync(0);
    // 타임아웃 5초 경과
    await vi.advanceTimersByTimeAsync(5000);

    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(mockUser);
  });

  it('getUser() 네트워크 에러 시 로컬 세션으로 fallback한다', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    const mockSession = { user: mockUser, access_token: 'valid-token' };
    mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });
    mockGetUser.mockRejectedValue(new Error('Network error'));

    useAuthStore.getState().initialize();

    await vi.waitFor(() => {
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(mockUser);
  });

  it('getSession() 에러 시 isAuthenticated: false로 설정한다', async () => {
    mockGetSession.mockRejectedValue(new Error('Storage error'));

    useAuthStore.getState().initialize();

    await vi.waitFor(() => {
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });
});
