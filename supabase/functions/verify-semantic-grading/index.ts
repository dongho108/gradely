import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getGradingPrompt } from './prompts.ts';
import { createProvider } from './providers/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Authorization 헤더 검증
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

    // 유효성 검사
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

    const strictness = body.strictness || 'standard';
    console.log(`Processing semantic grading for ${body.questions.length} questions (strictness: ${strictness})`);

    const provider = createProvider();
    const prompt = getGradingPrompt(strictness);
    const results = await provider.gradeSemantics(body.questions, prompt);

    console.log(`Graded ${results.length} questions`);

    return new Response(JSON.stringify({
      success: true,
      data: results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Semantic grading error:', error);
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
