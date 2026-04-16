import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/use-auth-store';
import { useTabStore, StoreExamSession } from '@/store/use-tab-store';
import { loadUserSessions, loadSessionSubmissions } from '@/lib/persistence-service';
import { startAutoSave, stopAutoSave } from '@/lib/auto-save';
import { StudentSubmission } from '@/types/grading';
import { useUserPreferencesStore } from '@/store/use-user-preferences-store';

/** Check if an error is likely an auth/session expiration error */
function isAuthError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const e = error as { message?: string; status?: number; code?: string };
    if (e.status === 401 || e.status === 403) return true;
    if (e.code === 'PGRST301' || e.code === 'PGRST302') return true; // PostgREST JWT errors
    if (e.message && /jwt|token|auth|expired|refresh/i.test(e.message)) return true;
  }
  return false;
}

export function useSessionSync() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const hydrateFromServer = useTabStore((s) => s.hydrateFromServer);
  const setHydrating = useTabStore((s) => s.setHydrating);
  const setHydrationError = useTabStore((s) => s.setHydrationError);
  const hasHydrated = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated || !user) {
      stopAutoSave();
      hasHydrated.current = false;
      setHydrating(false);
      setHydrationError(null);
      return;
    }

    // Already hydrated for this user
    if (hasHydrated.current) return;
    hasHydrated.current = true;

    const userId = user.id;

    async function loadFromServer() {
      setHydrating(true);
      setHydrationError(null);

      try {
        // 사용자 기본 설정 로드
        useUserPreferencesStore.getState().loadPreferences(userId);

        const dbSessions = await loadUserSessions(userId);

        if (dbSessions.length === 0) {
          // No server data - start auto-save with current local state
          setHydrating(false);
          startAutoSave(userId);
          return;
        }

        // Map DB sessions to StoreExamSession
        const sessions: StoreExamSession[] = dbSessions.map((s) => ({
          id: s.id,
          title: s.title,
          createdAt: s.created_at,
          status: s.status as 'idle' | 'ready',
          answerKeyFile: s.answer_key_file_name
            ? {
                name: s.answer_key_file_name,
                size: s.answer_key_file_size ?? 0,
                storagePath: s.answer_key_storage_path ?? undefined,
              }
            : undefined,
          answerKeyStructure: s.answer_key_structure ?? undefined,
          gradingStrictness: s.grading_strictness ?? undefined,
        }));

        // Load submissions for all sessions in parallel
        const allSubmissions: Record<string, StudentSubmission[]> = {};
        await Promise.all(
          dbSessions.map(async (session) => {
            const dbSubs = await loadSessionSubmissions(session.id);
            allSubmissions[session.id] = dbSubs.map((sub) => ({
              id: sub.id,
              studentName: sub.student_name,
              fileName: sub.file_name,
              storagePath: sub.storage_path ?? undefined,
              status: sub.status as 'pending' | 'graded',
              score:
                sub.score_correct != null && sub.score_total != null && sub.score_percentage != null
                  ? {
                      correct: sub.score_correct,
                      total: sub.score_total,
                      percentage: sub.score_percentage,
                    }
                  : undefined,
              results: sub.results ?? undefined,
              uploadedAt: sub.uploaded_at,
            }));
          })
        );

        hydrateFromServer(sessions, allSubmissions);
        console.log(`[SessionSync] Loaded ${sessions.length} sessions from server`);

        setHydrating(false);
        startAutoSave(userId);
      } catch (error) {
        console.error('[SessionSync] Failed to load from server:', error);
        setHydrating(false);

        if (isAuthError(error)) {
          setHydrationError('auth');
          hasHydrated.current = false; // Allow retry after re-login
        } else {
          setHydrationError('network');
          hasHydrated.current = false; // Allow retry
          startAutoSave(userId);
        }
      }
    }

    loadFromServer();

    return () => {
      stopAutoSave();
    };
  }, [isAuthenticated, isLoading, user, hydrateFromServer, setHydrating, setHydrationError]);
}
