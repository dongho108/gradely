import { useEffect } from 'react';
import { useAuthStore } from '@/store/use-auth-store';

/**
 * Hook to initialize authentication state.
 * Should be called once at the app root level.
 */
export function useAuthInit() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    const unsubscribe = initialize();

    return () => {
      unsubscribe();
    };
  }, [initialize]);
}
