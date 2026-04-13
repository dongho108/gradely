import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// --- Hoisted mocks ---
const { mockArchiveSession, mockDeleteSession, mockDeleteSessionFiles } = vi.hoisted(() => ({
  mockArchiveSession: vi.fn(),
  mockDeleteSession: vi.fn(),
  mockDeleteSessionFiles: vi.fn(),
}));

vi.mock('@/lib/persistence-service', () => ({
  archiveSession: mockArchiveSession,
}));

vi.mock('@/lib/storage-service', () => ({
  deleteSessionFiles: mockDeleteSessionFiles,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

vi.mock('@/lib/is-electron', () => ({
  isElectron: () => false,
}));

vi.mock('@/features/scanner/components/scanner-status-indicator', () => ({
  ScannerStatusIndicator: () => null,
}));

import { useTabStore } from '@/store/use-tab-store';
import { useAuthStore } from '@/store/use-auth-store';
import { Header } from '../header';

function resetStores() {
  useTabStore.setState({
    tabs: [
      { id: 'tab1', title: 'Test Exam', createdAt: Date.now(), status: 'ready' },
    ],
    activeTabId: 'tab1',
    submissions: {},
    isHydrating: false,
    hydrationError: null,
  });
  useAuthStore.setState({
    user: { id: 'user1', email: 'test@test.com' } as any,
    isAuthenticated: true,
    isLoading: false,
  });
}

describe('Header tab close', () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  it('calls archiveSession instead of deleteSession when closing a tab', async () => {
    mockArchiveSession.mockResolvedValue(undefined);

    render(<Header />);

    // Find and click the close button (X) for the tab
    const closeButtons = screen.getAllByRole('button').filter(
      (btn) => btn.getAttribute('aria-label') !== '새 시험' && btn.querySelector('svg')
    );

    // The close button is within the tab area
    const tabCloseBtn = closeButtons.find((btn) => {
      const svg = btn.querySelector('svg');
      return svg && btn.closest('[role]')?.textContent?.includes('Test Exam') === false;
    });

    // Find the X button specifically - it's inside the tab with class containing 'hover:bg-red-100'
    const xButton = document.querySelector('button.rounded-full[class*="opacity"]');
    expect(xButton).toBeTruthy();
    fireEvent.click(xButton!);

    await waitFor(() => {
      expect(mockArchiveSession).toHaveBeenCalledWith('tab1');
    });

    // deleteSession and deleteSessionFiles should NOT be called
    expect(mockDeleteSession).not.toHaveBeenCalled();
    expect(mockDeleteSessionFiles).not.toHaveBeenCalled();
  });

  it('does not remove tab from store if archiveSession fails', async () => {
    mockArchiveSession.mockRejectedValue(new Error('Network error'));

    render(<Header />);

    const xButton = document.querySelector('button.rounded-full[class*="opacity"]');
    expect(xButton).toBeTruthy();
    fireEvent.click(xButton!);

    await waitFor(() => {
      expect(mockArchiveSession).toHaveBeenCalledWith('tab1');
    });

    // Tab should still be in the store since archive failed
    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].id).toBe('tab1');
  });

  it('removes original tab from store after successful archive', async () => {
    mockArchiveSession.mockResolvedValue(undefined);

    render(<Header />);

    const xButton = document.querySelector('button.rounded-full[class*="opacity"]');
    fireEvent.click(xButton!);

    await waitFor(() => {
      const state = useTabStore.getState();
      // Original tab should be gone (a new empty tab may be auto-created by useEffect)
      expect(state.tabs.find((t) => t.id === 'tab1')).toBeUndefined();
    });
  });
});
