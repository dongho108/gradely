import type { SemanticGradingProvider, SemanticGradingQuestion, SemanticGradingResult } from './types.ts';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent';

export class GeminiSemanticProvider implements SemanticGradingProvider {
  name = 'gemini';
  apiKey: string;

  constructor() {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.apiKey = apiKey;
  }

  async gradeSemantics(questions: SemanticGradingQuestion[], prompt: string): Promise<SemanticGradingResult[]> {
    const requestBody = {
      system_instruction: {
        parts: [{ text: prompt }]
      },
      contents: [
        {
          parts: [
            {
              text: JSON.stringify({ questions })
            }
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
      headers: { 'Content-Type': 'application/json' },
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

  parseResult(text: string): SemanticGradingResult[] {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('채점 결과를 파싱할 수 없습니다.');
    }
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);
    return parsed.results as SemanticGradingResult[];
  }
}
