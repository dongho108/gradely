-- ============================================================
-- Migration: 20260805000000_create_vocabulary.sql
-- Creates vocabulary table — 채점 시 정답지에 없는 사전 의미를
-- 보완하기 위한 단어장(SL PRIME) 보조 사전.
--
-- 데이터는 scripts/seed-vocabulary.mjs 가 엑셀에서 적재한다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. vocabulary table
-- ------------------------------------------------------------
CREATE TABLE public.sl_vocabulary_dictionary (
  headword   TEXT PRIMARY KEY,           -- 영어 표제어 (소문자·공백 정규화된 형태)
  meanings   TEXT NOT NULL,              -- 한글 뜻 원문 (";" "," "/" 로 구분된 여러 뜻)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vocabulary IS '채점 보조 사전 — 영어 표제어별 한글 뜻';
COMMENT ON COLUMN public.vocabulary.headword IS 'lib/vocab-dictionary.ts 의 normalizeHeadword 와 동일한 규칙으로 정규화된 키';

-- ------------------------------------------------------------
-- 2. Row Level Security
--    읽기는 로그인 사용자 전체에 허용, 쓰기는 service_role 만 (정책 없음 = 거부)
-- ------------------------------------------------------------
ALTER TABLE public.vocabulary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vocabulary_select_authenticated"
  ON public.vocabulary
  FOR SELECT
  TO authenticated
  USING (true);
