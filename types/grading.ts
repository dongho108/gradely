/**
 * Student submission data structure
 */
export interface StudentSubmission {
  id: string;
  studentName: string;
  fileName: string;
  // Runtime file reference (not serializable - undefined for server-loaded submissions)
  fileRef?: File;
  // Supabase Storage path (used to lazy-download the file when needed)
  storagePath?: string;
  status: 'pending' | 'queued' | 'grading' | 'graded';
  score?: {
    correct: number;
    total: number;
    percentage: number;
  };
  results?: QuestionResult[];
  uploadedAt: number;
  // Pre-extracted OCR result from scanner — skips duplicate edge function call
  preExtractedStructure?: StudentExamStructure;
}

export interface QuestionResult {
  questionNumber: number;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  question?: string;            // Original question text
  isEdited?: boolean;           // Track manual edits by teacher
  aiReason?: string;            // AI 채점 판단 이유
}

export interface GradingResult {
  submissionId: string;
  studentName?: string;
  score: {
    correct: number;
    total: number;
    percentage: number;
  };
  results: QuestionResult[];
}

export interface AnswerKeyStructure {
  title: string;
  answers: Record<string, { text: string; question?: string }>;
  totalQuestions: number;
}

export interface StudentExamStructure {
  studentName: string;
  examTitle?: string;
  className?: string;
  answers: Record<string, string>;
  totalQuestions: number;
}
