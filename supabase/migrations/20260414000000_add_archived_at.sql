-- ============================================================
-- Migration: 20260414000000_add_archived_at.sql
-- Adds archived_at column to exam_sessions for soft-delete.
-- Tab close sets archived_at instead of hard-deleting,
-- preserving grading data (answer keys, submissions, results).
-- ============================================================

ALTER TABLE public.exam_sessions
  ADD COLUMN archived_at TIMESTAMPTZ DEFAULT NULL;

-- Partial index: speeds up the common "load active sessions" query
CREATE INDEX idx_exam_sessions_active
  ON public.exam_sessions (user_id)
  WHERE archived_at IS NULL;
