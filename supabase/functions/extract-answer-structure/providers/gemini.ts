const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent';
export class GeminiProvider {
  name = 'gemini';
  apiKey;
  constructor(){
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.apiKey = apiKey;
  }
  async extractStructure(images, prompt) {
    const imageParts = images.map((base64)=>({
        inlineData: {
          mimeType: 'image/jpeg',
          data: this.cleanBase64(base64)
        }
      }));
    const requestBody = {
      system_instruction: {
        parts: [
          {
            text: prompt
          }
        ]
      },
      contents: [
        {
          parts: [
            {
              text: '첨부된 정답지 이미지를 분석하고 정답 구조를 JSON으로 반환해주세요.'
            },
            ...imageParts
          ]
        }
      ],
      generationConfig: {
        temperature: 0,
        topP: 0.95,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingBudget: 1024
        }
      }
    };
    const response = await fetch(`${GEMINI_API_URL}?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API 호출 실패: ${response.status}`);
    }
    const geminiResponse = await response.json();
    if (geminiResponse.error) {
      throw new Error(`Gemini API 오류: ${geminiResponse.error.message}`);
    }
    const textResponse = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      throw new Error('Gemini API 응답이 비어있습니다.');
    }
    return this.parseResult(textResponse);
  }
  cleanBase64(base64) {
    return base64.replace(/^data:image\/\w+;base64,/, '');
  }
  parseResult(text) {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('정답 구조를 파싱할 수 없습니다.');
    }
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);
    // Record<string, string>을 Record<number, string>으로 변환
    const answers = {};
    for (const [key, value] of Object.entries(parsed.answers)){
      answers[parseInt(key, 10)] = value;
    }
    return {
      title: parsed.title || "Untitled Exam",
      answers,
      totalQuestions: parsed.totalQuestions,
      extractedAt: Date.now()
    };
  }
}
