-- ============================================================
-- Migration: 20260330000000_create_grading_reports.sql
-- Creates grading_reports table for users to report
-- suspected grading errors with full context snapshots.
-- ============================================================

-- ------------------------------------------------------------
-- 1. grading_reports table
-- ------------------------------------------------------------
CREATE TABLE public.grading_reports (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id              TEXT NOT NULL,
  submission_id           TEXT NOT NULL,
  student_name            TEXT NOT NULL,
  score_correct           INTEGER,
  score_total             INTEGER,
  score_percentage        DOUBLE PRECISION,
  results_snapshot        JSONB NOT NULL,
  answer_key_structure    JSONB NOT NULL,
  answer_key_storage_path TEXT,
  submission_storage_path TEXT,
  comment                 TEXT,
  status                  TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'resolved')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  developer_notes         TEXT
);

-- ------------------------------------------------------------
-- 2. Indexes
-- ------------------------------------------------------------
CREATE INDEX idx_grading_reports_status ON public.grading_reports (status);
CREATE INDEX idx_grading_reports_user_id ON public.grading_reports (user_id);
CREATE INDEX idx_grading_reports_created_at ON public.grading_reports (created_at DESC);

-- ------------------------------------------------------------
-- 3. Row Level Security
-- ------------------------------------------------------------
ALTER TABLE public.grading_reports ENABLE ROW LEVEL SECURITY;

-- Users can insert their own reports
CREATE POLICY "grading_reports_insert"
  ON public.grading_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own reports
CREATE POLICY "grading_reports_select"
  ON public.grading_reports FOR SELECT
  USING (auth.uid() = user_id);

-- Admin: developer can read all reports
CREATE POLICY "grading_reports_admin_select"
  ON public.grading_reports FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users WHERE email = 'dongho1088@gmail.com'
    )
  );

-- Admin: developer can update all reports (status, notes)
CREATE POLICY "grading_reports_admin_update"
  ON public.grading_reports FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users WHERE email = 'dongho1088@gmail.com'
    )
  );

-- Admin: developer can also read storage files referenced in reports
CREATE POLICY "Admin can read reported files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'exam-files'
    AND auth.uid() IN (
      SELECT id FROM auth.users WHERE email = 'dongho1088@gmail.com'
    )
  );
