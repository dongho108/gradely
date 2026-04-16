import { supabase } from '@/lib/supabase';
import { AnswerKeyStructure, QuestionResult } from '@/types/grading';

// --- DB row types ---

export interface PersistedExamSession {
  id: string;
  user_id: string;
  title: string;
  status: 'idle' | 'ready';
  created_at: number;
  answer_key_file_name: string | null;
  answer_key_file_size: number | null;
  answer_key_storage_path: string | null;
  answer_key_structure: AnswerKeyStructure | null;
  archived_at: string | null;
  deleted_at: string | null;
  updated_at: string;
}

export interface PersistedSubmission {
  id: string;
  session_id: string;
  user_id: string;
  student_name: string;
  file_name: string;
  storage_path: string | null;
  status: 'pending' | 'graded';
  score_correct: number | null;
  score_total: number | null;
  score_percentage: number | null;
  results: QuestionResult[] | null;
  uploaded_at: number;
  updated_at: string;
}

// --- Session CRUD ---

export async function loadUserSessions(userId: string): Promise<PersistedExamSession[]> {
  const { data, error } = await supabase
    .from('exam_sessions')
    .select('*')
    .eq('user_id', userId)
    .is('archived_at', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PersistedExamSession[];
}

export async function saveSession(session: Omit<PersistedExamSession, 'updated_at'>): Promise<void> {
  const { error } = await supabase
    .from('exam_sessions')
    .upsert(session, { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('exam_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

// --- Storage Path Lookups ---

export async function getSessionStoragePath(userId: string, sessionId: string): Promise<string | null> {
  // 1. DB에서 먼저 조회
  const { data } = await supabase
    .from('exam_sessions')
    .select('answer_key_storage_path')
    .eq('id', sessionId)
    .single();
  if (data?.answer_key_storage_path) return data.answer_key_storage_path;

  // 2. DB에 없으면 예측 경로로 Storage에 파일 존재 여부 확인
  const expectedPath = `${userId}/${sessionId}/answer-key.pdf`;
  const { data: signedUrl } = await supabase.storage
    .from('exam-files')
    .createSignedUrl(expectedPath, 60);
  if (signedUrl) {
    // 파일이 존재하면 DB도 업데이트
    await supabase
      .from('exam_sessions')
      .update({ answer_key_storage_path: expectedPath })
      .eq('id', sessionId);
    return expectedPath;
  }

  return null;
}

export async function getSubmissionStoragePath(userId: string, sessionId: string, submissionId: string): Promise<string | null> {
  // 1. DB에서 먼저 조회
  const { data } = await supabase
    .from('submissions')
    .select('storage_path, file_name')
    .eq('id', submissionId)
    .single();
  if (data?.storage_path) return data.storage_path;

  // 2. DB에 없으면 예측 경로로 Storage에 파일 존재 여부 확인
  const ext = data?.file_name?.endsWith('.pdf') ? 'pdf' : 'pdf';
  const expectedPath = `${userId}/${sessionId}/submissions/${submissionId}.${ext}`;
  const { data: signedUrl } = await supabase.storage
    .from('exam-files')
    .createSignedUrl(expectedPath, 60);
  if (signedUrl) {
    // 파일이 존재하면 DB도 업데이트
    await supabase
      .from('submissions')
      .update({ storage_path: expectedPath })
      .eq('id', submissionId);
    return expectedPath;
  }

  return null;
}

// --- Submission CRUD ---

export async function loadSessionSubmissions(sessionId: string): Promise<PersistedSubmission[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('session_id', sessionId)
    .order('uploaded_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PersistedSubmission[];
}

export async function saveSubmission(submission: Omit<PersistedSubmission, 'updated_at'>): Promise<void> {
  const { error } = await supabase
    .from('submissions')
    .upsert(submission, { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteSubmission(submissionId: string): Promise<void> {
  const { error } = await supabase
    .from('submissions')
    .delete()
    .eq('id', submissionId);
  if (error) throw error;
}

// --- Archive / Restore ---

export async function archiveSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('exam_sessions')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

export async function restoreSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('exam_sessions')
    .update({ archived_at: null })
    .eq('id', sessionId);
  if (error) throw error;
}

export async function loadArchivedSessions(userId: string): Promise<PersistedExamSession[]> {
  const { data, error } = await supabase
    .from('exam_sessions')
    .select('*')
    .eq('user_id', userId)
    .not('archived_at', 'is', null)
    .is('deleted_at', null)
    .order('archived_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PersistedExamSession[];
}
