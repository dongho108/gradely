import { describe, it, expect, beforeEach } from 'vitest';
import { useTabStore, StoreExamSession } from '../use-tab-store';
import type { StudentSubmission } from '@/types/grading';

// --- Helpers ---

function createSession(id: string, title: string): StoreExamSession {
  return {
    id,
    title,
    createdAt: Date.now(),
    status: 'ready',
    answerKeyStructure: {
      title,
      answers: { '1': { text: 'A' } },
      totalQuestions: 1,
    },
  };
}

function createSubmission(id: string, studentName: string): StudentSubmission {
  return {
    id,
    studentName,
    fileName: `${studentName}.pdf`,
    status: 'graded',
    score: { correct: 8, total: 10, percentage: 80 },
    results: [],
    uploadedAt: Date.now(),
  };
}

function resetStore() {
  useTabStore.setState({
    tabs: [],
    activeTabId: null,
    submissions: {},
    isHydrating: false,
    hydrationError: null,
  });
}

// --- Tests ---

describe('useTabStore.restoreSession', () => {
  beforeEach(resetStore);

  it('restores a session with submissions and activates it', () => {
    const session = createSession('s1', 'Midterm');
    const subs = [createSubmission('sub1', 'Alice'), createSubmission('sub2', 'Bob')];

    useTabStore.getState().restoreSession(session, subs);

    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].id).toBe('s1');
    expect(state.tabs[0].title).toBe('Midterm');
    expect(state.activeTabId).toBe('s1');
    expect(state.submissions['s1']).toHaveLength(2);
    expect(state.submissions['s1'][0].studentName).toBe('Alice');
  });

  it('activates existing tab without duplicating when session already open', () => {
    // Pre-populate with a tab
    const session = createSession('s1', 'Midterm');
    useTabStore.setState({
      tabs: [session],
      activeTabId: null,
      submissions: { s1: [createSubmission('sub1', 'Alice')] },
    });

    // Attempt to restore same session
    useTabStore.getState().restoreSession(session, [createSubmission('sub1', 'Alice')]);

    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(1); // No duplicate
    expect(state.activeTabId).toBe('s1'); // Activated
  });

  it('appends restored session to existing tabs', () => {
    const existing = createSession('s1', 'Existing');
    useTabStore.setState({ tabs: [existing], activeTabId: 's1', submissions: {} });

    const restored = createSession('s2', 'Restored');
    const subs = [createSubmission('sub1', 'Charlie')];

    useTabStore.getState().restoreSession(restored, subs);

    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[1].id).toBe('s2');
    expect(state.activeTabId).toBe('s2'); // Switches to restored
    expect(state.submissions['s2']).toHaveLength(1);
    // Existing submissions untouched
    expect(state.submissions['s1']).toBeUndefined();
  });

  it('restores session with empty submissions', () => {
    const session = createSession('s1', 'Empty Exam');

    useTabStore.getState().restoreSession(session, []);

    const state = useTabStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.submissions['s1']).toEqual([]);
  });

  it('preserves grading data (scores and results) on restore', () => {
    const session = createSession('s1', 'Graded Exam');
    const sub: StudentSubmission = {
      id: 'sub1',
      studentName: 'Diana',
      fileName: 'Diana.pdf',
      status: 'graded',
      score: { correct: 9, total: 10, percentage: 90 },
      results: [
        { questionNumber: 1, studentAnswer: 'A', correctAnswer: 'A', isCorrect: true },
        { questionNumber: 2, studentAnswer: 'C', correctAnswer: 'B', isCorrect: false },
      ],
      uploadedAt: Date.now(),
    };

    useTabStore.getState().restoreSession(session, [sub]);

    const state = useTabStore.getState();
    const restored = state.submissions['s1'][0];
    expect(restored.score?.correct).toBe(9);
    expect(restored.score?.percentage).toBe(90);
    expect(restored.results).toHaveLength(2);
    expect(restored.results![0].isCorrect).toBe(true);
    expect(restored.results![1].isCorrect).toBe(false);
  });
});
