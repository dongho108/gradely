import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import {
  useUserPreferencesStore,
  RESULT_VIEW_MODE_KEY,
} from '../use-user-preferences-store';

// jsdom in this project provides an empty localStorage object without Storage
// methods, so we install an in-memory shim for the duration of these tests.
beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    },
  });
});

describe('useUserPreferencesStore — resultViewMode', () => {
  beforeEach(() => {
    window.localStorage.removeItem(RESULT_VIEW_MODE_KEY);
    useUserPreferencesStore.setState({ resultViewMode: 'card' });
  });

  it('기본값은 "card"', () => {
    expect(useUserPreferencesStore.getState().resultViewMode).toBe('card');
  });

  it('setResultViewMode("list")는 state와 localStorage 모두 갱신', () => {
    useUserPreferencesStore.getState().setResultViewMode('list');
    expect(useUserPreferencesStore.getState().resultViewMode).toBe('list');
    expect(window.localStorage.getItem(RESULT_VIEW_MODE_KEY)).toBe('list');
  });

  it('setResultViewMode("card")로 다시 전환 가능', () => {
    useUserPreferencesStore.getState().setResultViewMode('list');
    useUserPreferencesStore.getState().setResultViewMode('card');
    expect(useUserPreferencesStore.getState().resultViewMode).toBe('card');
    expect(window.localStorage.getItem(RESULT_VIEW_MODE_KEY)).toBe('card');
  });

  it('hydrateResultViewMode는 localStorage의 "list"를 state로 복원', () => {
    window.localStorage.setItem(RESULT_VIEW_MODE_KEY, 'list');
    useUserPreferencesStore.getState().hydrateResultViewMode();
    expect(useUserPreferencesStore.getState().resultViewMode).toBe('list');
  });

  it('hydrateResultViewMode는 localStorage의 "card"도 복원', () => {
    useUserPreferencesStore.setState({ resultViewMode: 'list' });
    window.localStorage.setItem(RESULT_VIEW_MODE_KEY, 'card');
    useUserPreferencesStore.getState().hydrateResultViewMode();
    expect(useUserPreferencesStore.getState().resultViewMode).toBe('card');
  });

  it('localStorage에 잘못된 값이 있으면 기존 state 유지', () => {
    window.localStorage.setItem(RESULT_VIEW_MODE_KEY, 'garbage');
    useUserPreferencesStore.getState().hydrateResultViewMode();
    expect(useUserPreferencesStore.getState().resultViewMode).toBe('card');
  });

  it('localStorage에 키가 없으면 기존 state 유지', () => {
    expect(window.localStorage.getItem(RESULT_VIEW_MODE_KEY)).toBeNull();
    useUserPreferencesStore.getState().hydrateResultViewMode();
    expect(useUserPreferencesStore.getState().resultViewMode).toBe('card');
  });
});
