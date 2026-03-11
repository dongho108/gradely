import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { isElectron } from '@/lib/is-electron';
import { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  initialize: () => () => void; // Returns unsubscribe function
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  initialize: () => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({
        user: session?.user ?? null,
        isAuthenticated: !!session?.user,
        isLoading: false,
      });
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        set({
          user: session?.user ?? null,
          isAuthenticated: !!session?.user,
          isLoading: false,
        });
      }
    );

    // Electron: 딥링크 auth callback 리스너
    let removeAuthCallback: (() => void) | undefined;
    if (isElectron() && window.electronAPI?.onAuthCallback) {
      removeAuthCallback = window.electronAPI.onAuthCallback(async (code) => {
        console.log('[Auth] Deep link auth callback received');
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error('[Auth] Code exchange failed:', error);
          }
        } catch (e) {
          console.error('[Auth] Code exchange error:', e);
        }
      });
    }

    // Return unsubscribe function
    return () => {
      subscription.unsubscribe();
      removeAuthCallback?.();
    };
  },

  signInWithGoogle: async () => {
    try {
      const inElectron = isElectron();
      // Electron: 딥링크로 리다이렉트, 웹: 기존 origin 사용
      const redirectTo = inElectron
        ? 'ai-exam-grader://auth/callback'
        : `${window.location.origin}/auth/callback`;

      console.log('[Auth] Google Sign-In initiated');
      console.log('[Auth] Using redirect URL:', redirectTo);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        if (inElectron && window.electronAPI?.openExternal) {
          // Electron: 시스템 브라우저에서 OAuth 진행
          await window.electronAPI.openExternal(data.url);
        } else {
          // 웹: 팝업으로 OAuth 진행
          const popup = window.open(
            data.url,
            'google-login',
            'width=500,height=600,left=200,top=100'
          );

          if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            console.warn('Popup blocked, falling back to redirect');
            window.location.href = data.url;
          }
        }
      }
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  },

  signOut: async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      set({
        user: null,
        isAuthenticated: false,
      });
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  },
}));
