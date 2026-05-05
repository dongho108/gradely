import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { GradingStrictness } from '@/types/grading';

export type UiVariant = 'classic' | 'wds';
export type ResultViewMode = 'card' | 'list';

export const UI_VARIANT_KEY = 'gradely.uiVariant';
export const RESULT_VIEW_MODE_KEY = 'gradely.resultViewMode';

function persistVariant(variant: UiVariant) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UI_VARIANT_KEY, variant);
  } catch {
    // ignore quota / privacy errors
  }
}

function persistResultViewMode(mode: ResultViewMode) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RESULT_VIEW_MODE_KEY, mode);
  } catch {
    // ignore quota / privacy errors
  }
}

interface UserPreferencesState {
  defaultGradingStrictness: GradingStrictness;
  isLoaded: boolean;
  uiVariant: UiVariant;
  resultViewMode: ResultViewMode;

  setDefaultGradingStrictness: (strictness: GradingStrictness) => void;
  setUiVariant: (variant: UiVariant) => void;
  hydrateUiVariant: () => void;
  setResultViewMode: (mode: ResultViewMode) => void;
  hydrateResultViewMode: () => void;
  loadPreferences: (userId: string) => Promise<void>;
  savePreferences: (userId: string) => Promise<void>;
}

export const useUserPreferencesStore = create<UserPreferencesState>((set, get) => ({
  defaultGradingStrictness: 'standard',
  isLoaded: false,
  uiVariant: 'classic',
  resultViewMode: 'card',

  setDefaultGradingStrictness: (strictness) => set({ defaultGradingStrictness: strictness }),

  setUiVariant: (variant) => {
    persistVariant(variant);
    set({ uiVariant: variant });
  },

  hydrateUiVariant: () => {
    if (typeof window === 'undefined') return;
    try {
      const value = window.localStorage.getItem(UI_VARIANT_KEY);
      if (value === 'wds') set({ uiVariant: 'wds' });
    } catch {
      // ignore privacy errors
    }
  },

  setResultViewMode: (mode) => {
    persistResultViewMode(mode);
    set({ resultViewMode: mode });
  },

  hydrateResultViewMode: () => {
    if (typeof window === 'undefined') return;
    try {
      const value = window.localStorage.getItem(RESULT_VIEW_MODE_KEY);
      if (value === 'list' || value === 'card') set({ resultViewMode: value });
    } catch {
      // ignore privacy errors
    }
  },

  loadPreferences: async (userId) => {
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('default_grading_strictness')
        .eq('user_id', userId)
        .single();

      if (!error && data) {
        set({
          defaultGradingStrictness: data.default_grading_strictness as GradingStrictness,
          isLoaded: true,
        });
      } else {
        // 레코드 없음 — 기본값 사용
        set({ isLoaded: true });
      }
    } catch (error) {
      console.warn('Failed to load user preferences:', error);
      set({ isLoaded: true });
    }
  },

  savePreferences: async (userId) => {
    const { defaultGradingStrictness } = get();
    try {
      await supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          default_grading_strictness: defaultGradingStrictness,
        });
    } catch (error) {
      console.warn('Failed to save user preferences:', error);
    }
  },
}));
