-- ============================================================
-- Migration: 20260330000001_fix_grading_reports_rls.sql
-- Fix: auth.users subquery -> auth.jwt() for admin RLS policies
-- ============================================================

-- Drop existing admin policies
DROP POLICY IF EXISTS "grading_reports_admin_select" ON public.grading_reports;
DROP POLICY IF EXISTS "grading_reports_admin_update" ON public.grading_reports;
DROP POLICY IF EXISTS "Admin can read reported files" ON storage.objects;

-- Recreate using auth.jwt() instead of auth.users subquery
CREATE POLICY "grading_reports_admin_select"
  ON public.grading_reports FOR SELECT
  USING (auth.jwt() ->> 'email' = 'dongho1088@gmail.com');

CREATE POLICY "grading_reports_admin_update"
  ON public.grading_reports FOR UPDATE
  USING (auth.jwt() ->> 'email' = 'dongho1088@gmail.com');

CREATE POLICY "Admin can read reported files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'exam-files'
    AND auth.jwt() ->> 'email' = 'dongho1088@gmail.com'
  );
