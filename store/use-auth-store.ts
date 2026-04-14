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
    // Hybrid session validation:
    // 1. getSession() — check localStorage (no network, works in app:// protocol)
    // 2. getUser() — server-side token validation with timeout
    // 3. Fallback to local session if server validation fails (Electron app:// etc.)
    const validate = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          set({ user: null, isAuthenticated: false, isLoading: false });
          return;
        }

        // Server validation with 5s timeout
        try {
          const { data: { user }, error } = await Promise.race([
            supabase.auth.getUser(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 5000)
            ),
          ]);

          if (error || !user) {
            console.warn('[Auth] Session expired or invalid, clearing auth state');
            set({ user: null, isAuthenticated: false, isLoading: false });
          } else {
            set({ user, isAuthenticated: true, isLoading: false });
          }
        } catch {
          // Server validation failed/timeout — fallback to local session
          console.warn('[Auth] Server validation failed, using local session');
          set({ user: session.user, isAuthenticated: true, isLoading: false });
        }
      } catch (err) {
        console.error('[Auth] Failed to validate session:', err);
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    };

    validate();

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
      // Electron: localhost 콜백 서버로 리다이렉트, 웹: 기존 origin 사용
      let redirectTo: string;
      if (inElectron && window.electronAPI?.startAuthServer) {
        const port = await window.electronAPI.startAuthServer();
        redirectTo = `http://localhost:${port}/auth/callback`;
      } else {
        redirectTo = `${window.location.origin}/auth/callback`;
      }

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
