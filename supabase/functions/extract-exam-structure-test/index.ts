/**
 * extract-exam-structure-test — OCR 실험용 함수 (운영과 분리)
 *
 * 운영 함수(extract-exam-structure)를 건드리지 않고 모델·프롬프트 조합을
 * A/B 하기 위한 사본. 대시보드에 붙여넣기 쉽도록 한 파일로 합쳐 두었다.
 *
 * 환경변수:
 *   GEMINI_API_KEY  (필수)
 *   OCR_MODEL       기본 gemini-3.5-flash-lite  — 재배포 없이 모델 교체
 *   OCR_PROMPT_MODE 기본 v2 | v1(운영과 동일한 기존 프롬프트)
 *   OCR_THINKING    기본 1024 — 0 으로 두면 thinking 비활성
 *
 * 응답 형식은 운영 함수와 동일하다 (하네스가 그대로 쓸 수 있도록).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** 기존 운영 프롬프트 */
const PROMPT_V1 = `당신은 영어 시험지 답안 분석 전문가입니다.
제공된 학생 시험지 이미지에서 학생 이름과 모든 답안을 추출하세요.

## 작업 지침
1. 시험지 상단에서 학생 이름을 찾아 기록합니다.
2. 시험지 상단 등에서 해당 시험의 이름(제목)을 찾아 추출하여 "examTitle" 필드에 넣으세요. 찾을 수 없으면 시험지 내용을 요약한 것으로 대체합니다.
3. 각 문제 번호에 해당하는 학생의 답안을 순서대로 추출합니다.
4. 학생이 쓴 글자를 **시각적으로 보이는 그대로** 기록합니다.
5. 철자 오류가 있어도 수정하지 않고 그대로 기록합니다.

## 출력 형식
반드시 아래 JSON 형식으로만 응답하세요. 설명이나 서문 없이 JSON만 출력하세요.

{
  "studentName": "학생 이름 (없으면 '학생')",
  "examTitle": "시험 제목",
  "answers": { "1": "첫 번째 문제 학생 답안" },
  "totalQuestions": 답안 총 개수
}

## 주의사항
- 답안이 비어있거나 미작성인 경우 "(미작성)"으로 기록합니다.
- 손글씨를 읽을 수 없는 경우 "(판독불가)"로 기록합니다.
- 자동 수정 절대 금지: 'grammer'라고 쓰였으면 'grammer'로 기록합니다.`;

/** 정답 추론 금지를 강화한 실험 프롬프트 */
const PROMPT_V2 = `당신은 학생 시험지의 **손글씨를 판독하는 사람**입니다.
번역가나 채점자가 아닙니다. 이미지에 실제로 쓰인 글자만 옮겨 적으세요.

## 가장 중요한 규칙 — 정답을 만들어내지 마세요

시험지에는 문제인 **영단어가 인쇄**되어 있고, 그 옆에 학생이 손으로 뜻을 씁니다.

- **인쇄된 영단어의 뜻을 답안으로 기록하는 것은 금지입니다.** 그 뜻이 학생 손글씨로 실제 쓰여 있을 때만 기록합니다.
- 손글씨가 흐리거나 읽기 어려워도, 인쇄된 영단어를 보고 답을 추측해 채우지 마세요.
- **학생 답안의 상당수는 오답입니다.** 정답이 적혀 있을 것이라고 기대하지 마세요. 오답과 빈칸은 흔합니다.
- 손글씨가 정답과 전혀 다른 단어여도 그대로 옮겨 적으세요. 그것이 당신의 일입니다.

예시 — 인쇄된 단어가 "spear"(정답: 창)이고 학생이 "존엄"이라고 썼다면:
  올바름: "존엄"
  금지:   "창"   ← 인쇄된 단어에서 추론한 답. 절대 이렇게 하지 마세요.

## 작업 지침
1. 시험지 상단에서 학생 이름을 찾아 기록합니다.
2. 시험지 상단 등에서 해당 시험의 이름(제목)을 찾아 "examTitle" 필드에 넣으세요. 찾을 수 없으면 시험지 내용을 요약한 것으로 대체합니다.
3. 각 문제 번호에 해당하는 학생의 답안을 순서대로 추출합니다. **번호 열을 기준으로 행을 맞추세요.** 답안이 한 행씩 밀리지 않도록 번호와 같은 줄에 있는 손글씨만 그 번호의 답으로 기록합니다.
4. 학생이 쓴 글자를 **시각적으로 보이는 그대로** 기록합니다.
5. 철자 오류가 있어도 수정하지 않고 그대로 기록합니다.

## 판독 절차 (각 문항마다)
1. 그 행의 답안 칸에 손글씨 획이 있는지 먼저 확인합니다. 없으면 "(미작성)".
2. 획이 있으면 **글자 수를 셉니다.**
3. 각 글자의 초성·중성·종성을 하나씩 확인해 옮겨 적습니다.
4. 옮겨 적은 답의 글자 수가 (2)에서 센 글자 수와 같은지 확인합니다. 다르면 다시 읽습니다.
5. 그래도 읽을 수 없으면 "(판독불가)". **추측한 답보다 "(판독불가)"가 낫습니다.**

## 취소선/수정 처리
- 학생이 취소선을 긋거나 지운 글자는 무시합니다.
- 취소선 위에 새로 쓴 글자가 있으면 그것이 최종 답안입니다.

## 출력 형식
반드시 아래 JSON 형식으로만 응답하세요. 설명이나 서문 없이 JSON만 출력하세요.

{
  "studentName": "학생 이름 (없으면 '학생')",
  "examTitle": "시험 제목",
  "answers": { "1": "첫 번째 문제 학생 답안" },
  "totalQuestions": 답안 총 개수
}

## 주의사항
- 문제 번호는 숫자 키(문자열 형태)로 사용합니다.
- 답안이 비어있거나 미작성인 경우 "(미작성)"으로 기록합니다.
- 자동 수정 절대 금지: 'grammer'라고 쓰였으면 'grammer'로 기록합니다.
- 대소문자는 원본 그대로 유지합니다.
- **한국어 텍스트를 정확히 읽으세요.** 유사한 글자를 혼동하지 마세요 (예: 약/악, 양/앙, 열/엘 등).`;

function cleanBase64(base64: string): string {
  return base64.replace(/^data:image\/\w+;base64,/, '');
}

function parseResult(text: string) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('학생 답안 구조를 파싱할 수 없습니다.');
  const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);

  const answers: Record<number, string> = {};
  for (const [key, value] of Object.entries(parsed.answers ?? {})) {
    answers[parseInt(key, 10)] = value as string;
  }
  return {
    studentName: parsed.studentName || '학생',
    examTitle: parsed.examTitle || '',
    className: parsed.className,
    answers,
    totalQuestions: parsed.totalQuestions,
    extractedAt: Date.now(),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'Authorization 헤더가 필요합니다.', code: 'UNAUTHORIZED' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    if (!body.images?.length) {
      return new Response(JSON.stringify({ success: false, error: '시험지 이미지가 필요합니다.', code: 'MISSING_IMAGES' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    // 요청 바디로 덮어쓸 수 있어 하네스에서 조합을 바로 지정할 수 있다
    const model = body.model ?? Deno.env.get('OCR_MODEL') ?? 'gemini-3.5-flash-lite';
    const promptMode = body.promptMode ?? Deno.env.get('OCR_PROMPT_MODE') ?? 'v2';
    const thinking = Number(body.thinkingBudget ?? Deno.env.get('OCR_THINKING') ?? 1024);
    const prompt = promptMode === 'v1' ? PROMPT_V1 : PROMPT_V2;

    console.log(`[test] model=${model} prompt=${promptMode} thinking=${thinking} images=${body.images.length}`);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: prompt }] },
          contents: [
            {
              parts: [
                { text: '첨부된 시험지 이미지를 분석하고 학생 답안 구조를 JSON으로 반환해주세요.' },
                ...body.images.map((b64: string) => ({
                  inlineData: { mimeType: 'image/jpeg', data: cleanBase64(b64) },
                })),
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            topP: 0.95,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: thinking },
          },
        }),
      },
    );

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API 호출 실패: ${res.status} ${errorText.slice(0, 300)}`);
    }

    const geminiResponse = await res.json();
    if (geminiResponse.error) throw new Error(`Gemini API 오류: ${geminiResponse.error.message}`);

    const textResponse = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) throw new Error('Gemini API 응답이 비어있습니다.');

    return new Response(
      JSON.stringify({
        success: true,
        data: parseResult(textResponse),
        meta: { model, promptMode, thinking, usage: geminiResponse.usageMetadata },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '학생 답안 구조 추출 중 오류가 발생했습니다.';
    console.error('[test] error:', message);
    return new Response(JSON.stringify({ success: false, error: message, code: 'EXTRACTION_ERROR' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
