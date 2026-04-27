import { describe, it, expect } from 'vitest'
import { getGradingPrompt } from '../grading-prompts'

describe('lib/grading-prompts (클라이언트 측 활성 프롬프트) — 구조', () => {
  it('lenient와 standard 모두 공통 섹션을 포함한다', () => {
    const standard = getGradingPrompt('standard')
    const lenient = getGradingPrompt('lenient')

    for (const prompt of [standard, lenient]) {
      expect(prompt).toContain('questions 배열')
      expect(prompt).toContain('|||')
      expect(prompt).toContain('괄호')
      expect(prompt).toContain('(미작성)')
      expect(prompt).toContain('(판독불가)')
    }
  })

  it('lenient와 standard 모두 출력 JSON 형식 예시를 포함한다', () => {
    for (const prompt of [getGradingPrompt('standard'), getGradingPrompt('lenient')]) {
      expect(prompt).toContain('isCorrect')
      expect(prompt).toContain('reason')
      expect(prompt).toContain('results')
    }
  })

  it('기본값은 standard', () => {
    expect(getGradingPrompt()).toBe(getGradingPrompt('standard'))
  })
})

describe('lib/grading-prompts — standard 전용', () => {
  const standard = getGradingPrompt('standard')

  it('"언어 일치 필수"를 포함한다', () => {
    expect(standard).toContain('언어 일치 필수')
  })

  it('lenient 전용 문구는 포함하지 않는다', () => {
    expect(standard).not.toContain('사전 번역어')
    expect(standard).not.toContain('한↔영')
    expect(standard).not.toContain('의미장')
  })
})

describe('lib/grading-prompts — lenient 전용', () => {
  const lenient = getGradingPrompt('lenient')

  it('일반 관대 규칙(동의어, 자·타동사, 사역/피동)을 포함한다', () => {
    expect(lenient).toContain('동의어')
    expect(lenient).toContain('자동사/타동사')
    expect(lenient).toContain('사역/피동')
  })

  it('한↔영 번역 특별 규칙(최우선 적용)을 포함한다', () => {
    expect(lenient).toMatch(/한↔영|한국어↔영어/)
    expect(lenient).toMatch(/최우선|우선합니다/)
    expect(lenient).toContain('사전 번역어')
  })

  it('한↔영 번역 문항은 일반 관대 규칙(다른 언어 번역 인정)의 예외임을 명시한다', () => {
    expect(lenient).toContain('한↔영 번역 문항은 아래 특별 규칙을 따릅니다')
  })

  it('회귀 방지: 더 이상 "사전 역방향 번역어"를 정답으로 인정하지 않는다', () => {
    expect(lenient).not.toContain('사전 역방향 번역어')
    expect(lenient).not.toContain('반대 방향 사전 번역어')
  })

  it('회귀 방지: "각색하다를 영어로? 정답 adapt 학생 각색하다 → true" 잘못된 few-shot이 없다', () => {
    // 한국어로 답하라고 한 게 아니므로(번역 방향이 영어), 학생이 한국어 "각색하다"로 답하면 오답이어야 함
    // → 이 케이스는 isCorrect: true 로 등장하면 안 됨
    expect(lenient).not.toMatch(/각색하다를 영어로[?？].*학생 "각색하다".*isCorrect:\s*true/s)
  })

  it('단어만 제시된 형태(예: "account")도 한↔영 번역 문항으로 인식', () => {
    expect(lenient).toContain('단어만 제시된')
  })

  it('절대 원칙: 정답지의 한 의미만 정답이 아니다 (다의어 강조)', () => {
    expect(lenient).toMatch(/정답지.*하나의?\s*예시|여러 사전 의미 중 하나의 예시|다의어/)
    expect(lenient).toContain('또 다른 사전 번역어')
  })

  it('핵심 판단 절차 3단계(영단어 식별 → 사전 의미 나열 → 학생 답안 비교)를 포함한다', () => {
    expect(lenient).toMatch(/판단 절차|단계/)
    expect(lenient).toContain('영단어 식별')
    expect(lenient).toMatch(/사전 의미.*나열|모든 한국어 번역어/)
  })

  it('다의어/품사/자타동/능피동 변형을 명시적으로 다룬다 (정답 인정 폭 확대)', () => {
    expect(lenient).toMatch(/다의어/)
    expect(lenient).toMatch(/품사 변형|명사형.*동사형|품사가 다른/)
    expect(lenient).toMatch(/자동사.*타동사|자타동/)
    expect(lenient).toMatch(/능동.*피동|피동.*능동|사역/)
  })

  it('의미장(semantic field) 표현 정답 조항을 포함한다', () => {
    expect(lenient).toMatch(/semantic field|의미장/)
    expect(lenient).toContain('풀어 쓴')
  })

  it('"다른 영단어의 번역어" 가드(라)를 포함한다 (오답 판정)', () => {
    expect(lenient).toContain('다른 영단어의 번역어')
  })

  it('의미장 판단 가이드(영어 역추적) 문구를 포함한다', () => {
    expect(lenient).toMatch(/영어로 역추적|어떤 영단어/)
  })

  it('일반 few-shot(adapt, effectiveness)을 포함한다', () => {
    expect(lenient).toContain('adapt')
    expect(lenient).toContain('effectiveness')
    expect(lenient).toMatch(/각색하다|조정하다/)
    expect(lenient).toContain('유효성')
  })

  it('오타·미등재 가드(adaptt) 예시를 포함한다', () => {
    expect(lenient).toContain('adaptt')
    expect(lenient).toMatch(/사전 미등재|미등재/)
  })

  it('회귀 방지: 스냅샷 케이스별 few-shot은 포함하지 않는다 (일반 규칙으로 처리)', () => {
    // 케이스에 의존하지 않고 절차·원칙으로 풀도록 보강된 상태인지 확인
    expect(lenient).not.toContain('lock in')
    expect(lenient).not.toContain('signify')
    expect(lenient).not.toContain('locate')
    expect(lenient).not.toContain('representation')
    expect(lenient).not.toContain('monetary')
    expect(lenient).not.toContain('cumulative')
    expect(lenient).not.toContain('authority')
    expect(lenient).not.toContain('justify')
    expect(lenient).not.toContain('cast aside')
  })
})
