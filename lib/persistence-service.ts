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

export async function getSessionStoragePath(sessionId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('exam_sessions')
    .select('answer_key_storage_path')
    .eq('id', sessionId)
    .single();
  if (error) return null;
  return data?.answer_key_storage_path ?? null;
}

export async function getSubmissionStoragePath(submissionId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('submissions')
    .select('storage_path')
    .eq('id', submissionId)
    .single();
  if (error) return null;
  return data?.storage_path ?? null;
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
