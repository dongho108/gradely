import { describe, it, expect } from 'vitest'
import { parseCorrectAnswers } from '../answer-candidates'

describe('parseCorrectAnswers', () => {
  describe('구분자 분해', () => {
    it('세미콜론으로 구분된 뜻을 모두 분해한다', () => {
      expect(parseCorrectAnswers('범위; 정렬시키다')).toEqual(['범위', '정렬시키다'])
    })

    it('쉼표와 세미콜론이 섞여 있어도 모두 분해한다', () => {
      expect(parseCorrectAnswers('뜨다, 떠다니다; 부유물')).toEqual([
        '뜨다',
        '떠다니다',
        '부유물',
      ])
    })

    it('||| 구분자를 지원한다 (기존 형식 하위호환)', () => {
      expect(parseCorrectAnswers('glad|||happy|||joyful')).toEqual(['glad', 'happy', 'joyful'])
    })

    it('슬래시·파이프 구분자를 지원한다', () => {
      expect(parseCorrectAnswers('a/b|c')).toEqual(['a', 'b', 'c'])
    })

    it('구분자가 없으면 원본 하나만 반환한다', () => {
      expect(parseCorrectAnswers('title')).toEqual(['title'])
    })
  })

  describe('품사 태그 제거', () => {
    it('[명] [동] 태그를 제거하고 뜻만 남긴다', () => {
      expect(parseCorrectAnswers('[명] 페인트 [동] 페인트칠하다')).toEqual([
        '페인트',
        '페인트칠하다',
      ])
    })

    it('품사 태그와 세미콜론이 함께 있어도 분해한다', () => {
      expect(parseCorrectAnswers('[동] 분리하다; [형] 갈라진, 개개의')).toEqual([
        '분리하다',
        '갈라진',
        '개개의',
      ])
    })
  })

  describe('대괄호 동의어 표기 (A[B]C = AC 또는 BC)', () => {
    it('앞 어절을 대체하는 형태를 모두 후보로 만든다', () => {
      const result = parseCorrectAnswers('동반[동행]하다')
      expect(result).toContain('동반하다')
      expect(result).toContain('동행하다')
      expect(result).not.toContain('하다')
    })

    it('앞에 다른 어절이 있어도 마지막 어절만 대체한다', () => {
      const result = parseCorrectAnswers('통행 통과[횡단]하다')
      expect(result).toContain('통행 통과하다')
      expect(result).toContain('통행 횡단하다')
      expect(result).not.toContain('하다')
    })

    it('공백으로 떨어진 대괄호 표기도 처리한다', () => {
      const result = parseCorrectAnswers('버리다 [포기하다]')
      expect(result).toContain('버리다')
      expect(result).toContain('포기하다')
    })

    it('품사 태그는 여전히 구분자로 동작한다', () => {
      expect(parseCorrectAnswers('[명] 페인트 [동] 페인트칠하다')).toEqual([
        '페인트',
        '페인트칠하다',
      ])
    })

    it('품사 태그와 동의어 대괄호가 섞여 있어도 구분한다', () => {
      const result = parseCorrectAnswers('[동] 관리[운영]하다')
      expect(result).toContain('관리하다')
      expect(result).toContain('운영하다')
      expect(result).not.toContain('하다')
    })
  })

  describe('괄호 보충설명', () => {
    it('괄호를 제거한 형태와 괄호 안 내용을 뺀 형태를 모두 후보로 넣는다', () => {
      const result = parseCorrectAnswers('(그림 물감으로) 그리다')
      expect(result).toContain('그리다')
      expect(result).toContain('(그림 물감으로) 그리다')
    })

    it('괄호가 뒤에 붙어도 핵심 단어를 후보로 넣는다', () => {
      expect(parseCorrectAnswers('활동(특히 즐거움을 위한)')).toContain('활동')
    })

    it('괄호 안의 쉼표는 구분자로 쓰지 않는다', () => {
      // 실제 단어장 conduct 항목: "(열, 소리, 진동 등을) 전달하다"
      const result = parseCorrectAnswers('(열, 소리, 진동 등을) 전달하다')
      expect(result).toContain('전달하다')
      expect(result).toContain('(열, 소리, 진동 등을) 전달하다')
      expect(result).not.toContain('소리')
      expect(result).not.toContain('(열')
    })

    it('괄호를 떼면 의미 없는 어미만 남는 경우는 후보에서 제외한다', () => {
      // 실제 단어장 conduct 항목: "(특정한 활동을) 하다" → "하다" 는 정답이 될 수 없다
      const result = parseCorrectAnswers('(특정한 활동을) 하다')
      expect(result).toContain('(특정한 활동을) 하다')
      expect(result).not.toContain('하다')
    })

    it('괄호 밖 구분자는 그대로 동작한다', () => {
      expect(parseCorrectAnswers('(열, 소리 등을) 전달하다; 지휘하다')).toContain('지휘하다')
    })
  })

  describe('정리', () => {
    it('빈 항목과 중복을 제거한다', () => {
      expect(parseCorrectAnswers('가;; 가, 나')).toEqual(['가', '나'])
    })

    it('빈 문자열은 빈 배열을 반환한다', () => {
      expect(parseCorrectAnswers('')).toEqual([])
      expect(parseCorrectAnswers('   ')).toEqual([])
    })
  })

  describe('실제 정답지 데이터 (scripts/reports/answer-keys-cache.ts)', () => {
    const realCases: [string, string, string[]][] = [
      ['float', '뜨다, 떠다니다; 부유물', ['뜨다', '떠다니다', '부유물']],
      ['range', '범위; 정렬시키다', ['범위', '정렬시키다']],
      ['separate', '분리하다; 갈라진, 개개의', ['분리하다', '갈라진', '개개의']],
      ['conduct', '수행하다, 실시하다; 행위, 안내', ['수행하다', '실시하다', '행위', '안내']],
      ['animate', '생기 있게 하다, 고무하다; 살아 있는', ['생기 있게 하다', '고무하다', '살아 있는']],
    ]

    it.each(realCases)('%s: 정답지에 적힌 모든 뜻이 후보에 포함된다', (_word, key, meanings) => {
      const candidates = parseCorrectAnswers(key)
      for (const meaning of meanings) {
        expect(candidates).toContain(meaning)
      }
    })
  })
})
