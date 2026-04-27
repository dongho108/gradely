import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createProvider } from './providers/index.ts';

/**
 * verify-semantic-grading-v2
 *
 * v1 대비 차이:
 * - systemPrompt를 요청 바디로 받아 그대로 LLM에 주입한다 (필수)
 * - 프롬프트 관리·이터레이션을 클라이언트(lib/grading-prompts.ts)에서 수행
 * - 엣지 함수 재배포 없이 프롬프트를 수정·테스트할 수 있다
 *
 * 보안 노트: 프롬프트 주입은 신뢰된 클라이언트(교사용 앱)만 호출하는 전제.
 * 외부 공개 시 프롬프트 화이트리스트나 내부 fallback이 필요하다.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Authorization 헤더가 필요합니다.',
      code: 'UNAUTHORIZED'
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();

    if (!body.questions || !Array.isArray(body.questions) || body.questions.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: '채점할 문제 배열(questions)이 필요합니다.',
        code: 'MISSING_QUESTIONS'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (typeof body.systemPrompt !== 'string' || body.systemPrompt.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'systemPrompt가 필요합니다 (문자열).',
        code: 'MISSING_PROMPT'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(
      `v2: grading ${body.questions.length} questions ` +
      `(prompt size: ${body.systemPrompt.length} chars)`
    );

    const provider = createProvider();
    const results = await provider.gradeSemantics(body.questions, body.systemPrompt);

    console.log(`v2: graded ${results.length} questions`);

    return new Response(JSON.stringify({
      success: true,
      data: results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('v2 semantic grading error:', error);
    const errorMessage = error instanceof Error ? error.message : '시멘틱 채점 중 오류가 발생했습니다.';

    let errorCode = 'GRADING_ERROR';
    if (errorMessage.includes('API_KEY')) {
      errorCode = 'API_KEY_ERROR';
    } else if (errorMessage.includes('파싱')) {
      errorCode = 'PARSE_ERROR';
    } else if (errorMessage.includes('API 호출')) {
      errorCode = 'API_CALL_ERROR';
    }

    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      code: errorCode
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
