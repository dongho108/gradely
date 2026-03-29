import { supabase } from '@/lib/supabase';
import { QuestionResult, AnswerKeyStructure } from '@/types/grading';

// --- Types ---

export interface GradingReport {
  id: string;
  user_id: string;
  session_id: string;
  submission_id: string;
  student_name: string;
  score_correct: number | null;
  score_total: number | null;
  score_percentage: number | null;
  results_snapshot: QuestionResult[];
  answer_key_structure: AnswerKeyStructure;
  answer_key_storage_path: string;
  submission_storage_path: string;
  comment: string | null;
  status: 'open' | 'reviewed' | 'resolved';
  created_at: string;
  developer_notes: string | null;
}

// --- User-facing: submit a report ---

export async function submitGradingReport(params: {
  userId: string;
  sessionId: string;
  submissionId: string;
  studentName: string;
  score: { correct: number; total: number; percentage: number };
  resultsSnapshot: QuestionResult[];
  answerKeyStructure: AnswerKeyStructure;
  answerKeyStoragePath: string;
  submissionStoragePath: string;
  comment?: string;
}): Promise<void> {
  const { error } = await supabase.from('grading_reports').insert({
    user_id: params.userId,
    session_id: params.sessionId,
    submission_id: params.submissionId,
    student_name: params.studentName,
    score_correct: params.score.correct,
    score_total: params.score.total,
    score_percentage: params.score.percentage,
    results_snapshot: params.resultsSnapshot,
    answer_key_structure: params.answerKeyStructure,
    answer_key_storage_path: params.answerKeyStoragePath,
    submission_storage_path: params.submissionStoragePath,
    comment: params.comment || null,
  });
  if (error) throw error;
}

// --- Admin: load all reports ---

export async function loadAllReports(status?: string): Promise<GradingReport[]> {
  let query = supabase
    .from('grading_reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as GradingReport[];
}

// --- Admin: update report status ---

export async function updateReportStatus(
  id: string,
  status: 'open' | 'reviewed' | 'resolved',
  developerNotes?: string,
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (developerNotes !== undefined) {
    update.developer_notes = developerNotes;
  }
  const { error } = await supabase
    .from('grading_reports')
    .update(update)
    .eq('id', id);
  if (error) throw error;
}

// --- Admin: get signed URL for a storage file ---

export async function getReportFileUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('exam-files')
    .createSignedUrl(storagePath, 3600); // 1 hour
  if (error) throw error;
  return data.signedUrl;
}
