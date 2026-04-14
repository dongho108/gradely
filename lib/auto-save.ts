import { useTabStore, StoreExamSession } from '@/store/use-tab-store';
import { StudentSubmission } from '@/types/grading';
import { saveSession, saveSubmission } from '@/lib/persistence-service';
import { uploadAnswerKey, uploadSubmissionFile } from '@/lib/storage-service';
import { cacheFile } from '@/lib/file-resolver';

const DEBOUNCE_MS = 2000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

// Transient statuses that should not be saved
const TRANSIENT_SESSION_STATUSES = new Set(['uploading', 'extracting', 'grading']);
const TRANSIENT_SUBMISSION_STATUSES = new Set(['queued', 'grading']);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let previousState: {
  tabs: StoreExamSession[];
  submissions: Record<string, StudentSubmission[]>;
} | null = null;

let currentUserId: string | null = null;

async function retryOperation<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[i]));
    }
  }
  throw new Error('Unreachable');
}

function mapSessionStatus(status: string): 'idle' | 'ready' {
  if (status === 'ready') return 'ready';
  return 'idle';
}

function mapSubmissionStatus(status: string): 'pending' | 'graded' {
  if (status === 'graded') return 'graded';
  return 'pending';
}

async function saveChanges() {
  const state = useTabStore.getState();
  const userId = currentUserId;
  if (!userId) return;

  const prev = previousState;
  previousState = { tabs: state.tabs, submissions: { ...state.submissions } };

  // Save changed sessions
  for (const tab of state.tabs) {
    if (TRANSIENT_SESSION_STATUSES.has(tab.status)) continue;

    const prevTab = prev?.tabs.find((t) => t.id === tab.id);
    if (prevTab && JSON.stringify(prevTab) === JSON.stringify(tab)) continue;

    try {
      await retryOperation(() =>
        saveSession({
          id: tab.id,
          user_id: userId,
          title: tab.title,
          status: mapSessionStatus(tab.status),
          created_at: tab.createdAt,
          answer_key_file_name: tab.answerKeyFile?.name ?? null,
          answer_key_file_size: tab.answerKeyFile?.size ?? null,
          answer_key_storage_path: tab.answerKeyFile?.storagePath ?? null,
          answer_key_structure: tab.answerKeyStructure ?? null,
          archived_at: null,
          deleted_at: null,
        })
      );
    } catch (error) {
      console.error(`[AutoSave] Failed to save session ${tab.id}:`, error);
    }
  }

  // Save changed submissions
  for (const [tabId, subs] of Object.entries(state.submissions)) {
    for (const sub of subs) {
      if (TRANSIENT_SUBMISSION_STATUSES.has(sub.status)) continue;

      const prevSub = prev?.submissions[tabId]?.find((s) => s.id === sub.id);
      if (prevSub && JSON.stringify(prevSub) === JSON.stringify(sub)) continue;

      try {
        await retryOperation(() =>
          saveSubmission({
            id: sub.id,
            session_id: tabId,
            user_id: userId,
            student_name: sub.studentName,
            file_name: sub.fileName,
            storage_path: sub.storagePath ?? null,
            status: mapSubmissionStatus(sub.status),
            score_correct: sub.score?.correct ?? null,
            score_total: sub.score?.total ?? null,
            score_percentage: sub.score?.percentage ?? null,
            results: sub.results ?? null,
            uploaded_at: sub.uploadedAt,
          })
        );
      } catch (error) {
        console.error(`[AutoSave] Failed to save submission ${sub.id}:`, error);
      }
    }
  }
}

function scheduleSave() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    saveChanges().catch((err) => console.error('[AutoSave] Save error:', err));
  }, DEBOUNCE_MS);
}

let unsubscribe: (() => void) | null = null;

export function startAutoSave(userId: string): void {
  stopAutoSave();
  currentUserId = userId;

  // Capture initial state
  const state = useTabStore.getState();
  previousState = { tabs: state.tabs, submissions: { ...state.submissions } };

  unsubscribe = useTabStore.subscribe(scheduleSave);
  console.log('[AutoSave] Started');
}

export function stopAutoSave(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  currentUserId = null;
  previousState = null;
  console.log('[AutoSave] Stopped');
}

/**
 * Upload answer key PDF and update store with storagePath.
 * Called after extraction succeeds.
 */
export async function uploadAndTrackAnswerKey(
  userId: string,
  sessionId: string,
  file: File
): Promise<void> {
  try {
    const storagePath = await uploadAnswerKey(userId, sessionId, file);
    cacheFile(storagePath, file);

    // Update the store with storagePath
    const state = useTabStore.getState();
    const tab = state.tabs.find((t) => t.id === sessionId);
    if (tab?.answerKeyFile) {
      useTabStore.setState({
        tabs: state.tabs.map((t) =>
          t.id === sessionId
            ? { ...t, answerKeyFile: { ...t.answerKeyFile!, storagePath } }
            : t
        ),
      });
    }
  } catch (error) {
    console.error('[AutoSave] Failed to upload answer key:', error);
  }
}

/**
 * Upload submission PDF and update store with storagePath.
 * Called after submission is added.
 */
export async function uploadAndTrackSubmission(
  userId: string,
  sessionId: string,
  submissionId: string,
  file: File
): Promise<void> {
  try {
    const storagePath = await uploadSubmissionFile(userId, sessionId, submissionId, file);
    cacheFile(storagePath, file);

    // Update the store with storagePath
    const state = useTabStore.getState();
    const subs = state.submissions[sessionId];
    if (subs) {
      useTabStore.setState({
        submissions: {
          ...state.submissions,
          [sessionId]: subs.map((s) =>
            s.id === submissionId ? { ...s, storagePath } : s
          ),
        },
      });
    }
  } catch (error) {
    console.error('[AutoSave] Failed to upload submission:', error);
  }
}
