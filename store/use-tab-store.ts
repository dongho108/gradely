import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { ExamSession, ClassifiedStudent, AnswerKeyEntry, ScannedPage } from '@/types';
import { StudentSubmission, GradingResult, AnswerKeyStructure, StudentExamStructure, GradingStrictness } from '@/types/grading';

/**
 * Merges OCR results from multiple scanned pages into a single StudentExamStructure.
 * Returns undefined if no pages have OCR results.
 */
function mergeOcrResults(pages: ScannedPage[]): StudentExamStructure | undefined {
  const withOcr = pages.filter(p => p.ocrResult);
  if (withOcr.length === 0) return undefined;
  if (withOcr.length === 1) return withOcr[0].ocrResult;

  const base = withOcr[0].ocrResult!;
  const mergedAnswers = { ...base.answers };
  let totalQuestions = base.totalQuestions;

  for (let i = 1; i < withOcr.length; i++) {
    const ocr = withOcr[i].ocrResult!;
    Object.assign(mergedAnswers, ocr.answers);
    totalQuestions = Math.max(totalQuestions, ocr.totalQuestions, Object.keys(mergedAnswers).length);
  }

  return {
    ...base,
    answers: mergedAnswers,
    totalQuestions,
  };
}

// Extend ExamSession to include answerKeyFile and answerKeyStructure
export interface StoreExamSession extends ExamSession {
  answerKeyFile?: { name: string; size: number; fileRefs?: File[]; storagePath?: string };
  answerKeyStructure?: AnswerKeyStructure | null;
}

interface TabState {
  tabs: StoreExamSession[];
  activeTabId: string | null;
  submissions: Record<string, StudentSubmission[]>; // tabId -> submissions

  // Hydration state
  isHydrating: boolean;
  hydrationError: string | null;
  setHydrating: (loading: boolean) => void;
  setHydrationError: (error: string | null) => void;

  // Tab Actions
  addTab: () => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTabTitle: (id: string, title: string) => void;
  setAnswerKeyFile: (id: string, file: File) => void;
  setAnswerKeyStructure: (id: string, structure: AnswerKeyStructure) => void;
  
  // Submission Actions
  addSubmission: (tabId: string, file: File | File[], id?: string) => void;
  updateSubmissionGrade: (tabId: string, submissionId: string, result: GradingResult) => void;
  setSubmissionStatus: (tabId: string, submissionId: string, status: StudentSubmission['status']) => void;
  removeSubmission: (tabId: string, submissionId: string) => void;

  // Grading Strictness
  setGradingStrictness: (tabId: string, strictness: GradingStrictness | undefined) => void;

  // Scanner Actions
  addTabFromScan: (params: { students: ClassifiedStudent[]; answerKeys: AnswerKeyEntry[] }) => number;
  addTabFromAnswerKey: (answerKey: { title: string; files: File[]; structure: import('@/types/grading').AnswerKeyStructure }) => string;

  // Restore Action
  restoreSession: (session: StoreExamSession, submissions: StudentSubmission[]) => void;

  // Persistence Actions
  hydrateFromServer: (sessions: StoreExamSession[], submissions: Record<string, StudentSubmission[]>) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  submissions: {},
  isHydrating: false,
  hydrationError: null,
  setHydrating: (loading) => set({ isHydrating: loading }),
  setHydrationError: (error) => set({ hydrationError: error }),

  addTab: () => {
    const newTab: StoreExamSession = {
      id: generateId(),
      title: 'New Exam',
      createdAt: Date.now(),
      status: 'idle',
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTab.id,
    }));
  },

  removeTab: (id) => {
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      
      // If we removed the active tab, switch to the last one or null
      let newActiveId = state.activeTabId;
      if (id === state.activeTabId) {
        newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
      }

      return {
        tabs: newTabs,
        activeTabId: newActiveId,
      };
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTabTitle: (id, title) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    })),

  setAnswerKeyFile: (id, file) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              status: 'extracting', // Changed from 'ready' to 'extracting'
              title: file.name.replace('.pdf', ''),
              answerKeyFile: {
                name: file.name,
                size: file.size,
                fileRefs: [file],
              },
            }
          : t
      ),
    })),

  setAnswerKeyStructure: (id, structure) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id 
          ? { ...t, answerKeyStructure: structure, status: 'ready', title: structure.title || t.title } 
          : t
      ),
    })),

  setGradingStrictness: (tabId, strictness) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, gradingStrictness: strictness } : t
      ),
    })),

  addSubmission: (tabId, file, id) => {
    const files = Array.isArray(file) ? file : [file];
    if (files.length === 0) return;
    const firstFile = files[0];
    const newSubmission: StudentSubmission = {
      id: id || generateId(),
      studentName: firstFile.name.replace('.pdf', '').replace(/_/g, ' '),
      fileName: firstFile.name,
      fileRefs: files,
      status: 'pending' as const,
      uploadedAt: Date.now(),
    };

    set((state) => ({
      submissions: {
        ...state.submissions,
        [tabId]: [...(state.submissions[tabId] || []), newSubmission],
      },
    }));
  },

  updateSubmissionGrade: (tabId, submissionId, result) => {
    set((state) => ({
      submissions: {
        ...state.submissions,
        [tabId]: (state.submissions[tabId] || []).map((sub) =>
          sub.id === submissionId
            ? {
                ...sub,
                status: 'graded' as const,
                studentName: result.studentName || sub.studentName,
                score: result.score,
                results: result.results,
              }
            : sub
        ),
      },
    }));
  },

  setSubmissionStatus: (tabId, submissionId, status) => {
    set((state) => ({
      submissions: {
        ...state.submissions,
        [tabId]: (state.submissions[tabId] || []).map((sub) =>
          sub.id === submissionId ? { ...sub, status } : sub
        ),
      },
    }));
  },

  removeSubmission: (tabId, submissionId) => {
    set((state) => ({
      submissions: {
        ...state.submissions,
        [tabId]: (state.submissions[tabId] || []).filter(sub => sub.id !== submissionId)
      },
    }));
  },

  addTabFromScan: ({ students, answerKeys }) => {
    const groups = new Map<string, { examTitle: string; students: ClassifiedStudent[]; answerKey: AnswerKeyEntry | undefined }>();

    for (const student of students) {
      if (!student.name || !student.examTitle || !student.answerKeyId) {
        console.warn('[addTabFromScan] 학생 스킵:', { name: student.name, examTitle: student.examTitle, answerKeyId: student.answerKeyId })
        continue;
      }

      const groupKey = student.examTitle;
      const answerKey = answerKeys.find(k => k.id === student.answerKeyId);

      const existing = groups.get(groupKey);
      if (existing) {
        existing.students.push(student);
      } else {
        groups.set(groupKey, {
          examTitle: student.examTitle,
          students: [student],
          answerKey,
        });
      }
    }

    const newTabs: StoreExamSession[] = [];
    const newSubmissions: Record<string, StudentSubmission[]> = {};

    for (const group of groups.values()) {
      if (group.students.length === 0 || !group.answerKey) {
        console.warn('[addTabFromScan] 그룹 스킵:', { examTitle: group.examTitle, studentCount: group.students.length, hasAnswerKey: !!group.answerKey })
        continue;
      }

      const tabId = generateId();
      const title = group.examTitle;

      newTabs.push({
        id: tabId,
        title,
        createdAt: Date.now(),
        status: 'ready',
        answerKeyFile: {
          name: group.answerKey.files[0].name,
          size: group.answerKey.files.reduce((sum, f) => sum + f.size, 0),
          fileRefs: group.answerKey.files,
        },
        answerKeyStructure: group.answerKey.structure,
      });

      newSubmissions[tabId] = group.students.map((student) => {
        // Merge OCR results from all pages into a single structure
        const mergedStructure = mergeOcrResults(student.pages);
        return {
          id: generateId(),
          studentName: student.name,
          fileName: student.pages[0]?.file.name ?? `${student.name}.pdf`,
          fileRefs: student.pages.flatMap(p => p.files ?? [p.file]),
          status: 'queued' as const,
          uploadedAt: Date.now(),
          preExtractedStructure: mergedStructure,
        };
      });
    }

    set((state) => ({
      tabs: [...state.tabs, ...newTabs],
      activeTabId: newTabs.length > 0 ? newTabs[0].id : state.activeTabId,
      submissions: { ...state.submissions, ...newSubmissions },
    }));

    return newTabs.length;
  },

  addTabFromAnswerKey: (answerKey) => {
    const tabId = generateId();
    const newTab: StoreExamSession = {
      id: tabId,
      title: answerKey.title || 'New Exam',
      createdAt: Date.now(),
      status: 'ready',
      answerKeyFile: {
        name: answerKey.files[0].name,
        size: answerKey.files.reduce((sum, f) => sum + f.size, 0),
        fileRefs: answerKey.files,
      },
      answerKeyStructure: answerKey.structure,
    };

    set((state) => ({
      tabs: [...state.tabs, newTab],
      activeTabId: tabId,
    }));

    return tabId;
  },

  restoreSession: (session, submissions) => {
    set((state) => {
      // Already open — just activate
      const existing = state.tabs.find((t) => t.id === session.id);
      if (existing) {
        return { activeTabId: session.id };
      }
      return {
        tabs: [...state.tabs, session],
        activeTabId: session.id,
        submissions: {
          ...state.submissions,
          [session.id]: submissions,
        },
      };
    });
  },

  hydrateFromServer: (sessions, submissions) => {
    set({
      tabs: sessions,
      activeTabId: sessions.length > 0 ? sessions[sessions.length - 1].id : null,
      submissions,
    });
  },
}));

