import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { GradingStrictness } from '@/types/grading';

interface UserPreferencesState {
  defaultGradingStrictness: GradingStrictness;
  isLoaded: boolean;

  setDefaultGradingStrictness: (strictness: GradingStrictness) => void;
  loadPreferences: (userId: string) => Promise<void>;
  savePreferences: (userId: string) => Promise<void>;
}

export const useUserPreferencesStore = create<UserPreferencesState>((set, get) => ({
  defaultGradingStrictness: 'standard',
  isLoaded: false,

  setDefaultGradingStrictness: (strictness) => set({ defaultGradingStrictness: strictness }),

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
