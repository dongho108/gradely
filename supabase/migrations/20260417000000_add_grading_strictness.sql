-- 채점 엄격도 설정 기능 추가
-- strict: 정확히 일치해야 정답 (로컬 텍스트 비교)
-- standard: 의미 동일 시 허용 (AI 채점, 기본값)
-- lenient: 핵심 의미 포함 시 허용 (AI 채점)

-- 1. exam_sessions에 시험별 엄격도 컬럼 추가 (NULL = 사용자 기본값 사용)
ALTER TABLE public.exam_sessions
  ADD COLUMN grading_strictness TEXT
  CHECK (grading_strictness IN ('strict', 'standard', 'lenient'));

-- 2. user_preferences 테이블 신규 생성
CREATE TABLE public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_grading_strictness TEXT NOT NULL DEFAULT 'standard'
    CHECK (default_grading_strictness IN ('strict', 'standard', 'lenient')),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. updated_at 자동 갱신 트리거 (기존 함수 재사용)
CREATE TRIGGER trg_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RLS 활성화 및 정책 설정
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
