-- ============================================================
-- Migration: 20260805000100_rename_vocabulary_to_sl_voca_db.sql
-- vocabulary 테이블을 SL_VOCA_DB 로 이름 변경.
--
-- 대문자 식별자라 raw SQL 에서는 반드시 큰따옴표로 감싸야 한다
-- ("SL_VOCA_DB"). PostgREST(supabase-js) 는 이름을 그대로 전달하므로
-- .from('SL_VOCA_DB') 로 조회된다.
-- ============================================================

ALTER TABLE public.vocabulary RENAME TO "SL_VOCA_DB";

-- 인덱스·정책 이름도 테이블에 맞춰 정리 (동작에는 영향 없음)
ALTER INDEX public.vocabulary_pkey RENAME TO "SL_VOCA_DB_pkey";

ALTER POLICY "vocabulary_select_authenticated"
  ON public."SL_VOCA_DB"
  RENAME TO "SL_VOCA_DB_select_authenticated";

COMMENT ON TABLE public."SL_VOCA_DB" IS '채점 보조 사전 — 영어 표제어별 한글 뜻 (SL PRIME 단어장)';
