import { describe, it, expect } from 'vitest'
import {
  levenshteinDistance,
  calculateSimilarity,
  matchExamTitle,
  groupPagesByStudent,
  groupPagesByFixedCount,
  base64ToFile,
} from '../scan-utils'
import type { AnswerKeyEntry, ScannedPage } from '@/types'

// Helper to create a mock AnswerKeyEntry
function makeAnswerKey(id: string, title: string): AnswerKeyEntry {
  return {
    id,
    title,
    files: [new File([], 'test.pdf')],
    structure: { title, answers: {}, totalQuestions: 10 },
    createdAt: Date.now(),
  }
}

// Helper to create a mock ScannedPage
function makePage(id: string, name?: string, examTitle?: string): ScannedPage {
  return {
    id,
    file: new File([], `${id}.png`),
    ocrResult: name
      ? { studentName: name, examTitle, answers: {}, totalQuestions: 0 }
      : undefined,
  }
}

describe('levenshteinDistance', () => {
  it('동일 문자열 → 0', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0)
  })

  it('완전히 다른 문자열 → max(len1, len2)', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3)
  })

  it('빈 문자열 → 상대 문자열 길이', () => {
    expect(levenshteinDistance('', 'hello')).toBe(5)
    expect(levenshteinDistance('hello', '')).toBe(5)
  })

  it('"수학 중간고사" vs "수학 중간 고사" → 1 (공백 삽입)', () => {
    expect(levenshteinDistance('수학 중간고사', '수학 중간 고사')).toBe(1)
  })

  it('한글 문자열 정상 처리', () => {
    expect(levenshteinDistance('가나다', '가나다')).toBe(0)
    expect(levenshteinDistance('가나다', '가나라')).toBe(1)
  })
})

describe('calculateSimilarity', () => {
  it('동일 문자열 → 1.0', () => {
    expect(calculateSimilarity('hello', 'hello')).toBe(1.0)
  })

  it('완전히 다른 문자열 → 0에 가까움', () => {
    const sim = calculateSimilarity('abc', 'xyz')
    expect(sim).toBeLessThanOrEqual(0.1)
  })

  it('빈 문자열 둘 다 → 1.0', () => {
    expect(calculateSimilarity('', '')).toBe(1.0)
  })
})

describe('matchExamTitle', () => {
  const keys = [
    makeAnswerKey('1', '수학 중간고사'),
    makeAnswerKey('2', '영어 기말고사'),
    makeAnswerKey('3', '과학 수행평가'),
  ]

  it('정확히 일치하는 정답지 반환', () => {
    const result = matchExamTitle('수학 중간고사', keys)
    expect(result?.id).toBe('1')
  })

  it('80% 이상 유사한 정답지 반환 (OCR 오타 허용)', () => {
    // "수학 중간 고사" has distance 1 from "수학 중간고사" (7 chars), similarity ~0.86
    const result = matchExamTitle('수학 중간 고사', keys)
    expect(result?.id).toBe('1')
  })

  it('79% 미만 → null 반환', () => {
    const result = matchExamTitle('국어 중간고사', keys)
    // "국어 중간고사" vs "수학 중간고사" → distance 2/7 ≈ 0.71 < 0.8
    expect(result).toBeNull()
  })

  it('여러 정답지 중 가장 유사한 것 반환', () => {
    const result = matchExamTitle('수학 중간고사', keys)
    expect(result?.id).toBe('1')
  })

  it('빈 answerKeys 배열 → null', () => {
    expect(matchExamTitle('수학 중간고사', [])).toBeNull()
  })

  it('빈 title → null (매칭 불가)', () => {
    expect(matchExamTitle('', keys)).toBeNull()
  })
})

describe('groupPagesByStudent', () => {
  const keys = [makeAnswerKey('ak1', '수학 중간고사')]

  it('동일 이름+제목 페이지 → 하나의 그룹으로 합침', () => {
    const pages = [
      makePage('p1', '홍길동', '수학 중간고사'),
      makePage('p2', '홍길동', '수학 중간고사'),
    ]
    const result = groupPagesByStudent(pages, keys)
    const hong = result.find((g) => g.name === '홍길동')
    expect(hong).toBeDefined()
    expect(hong!.pages).toHaveLength(2)
  })

  it('다른 이름 → 별도 그룹', () => {
    const pages = [
      makePage('p1', '홍길동', '수학 중간고사'),
      makePage('p2', '김철수', '수학 중간고사'),
    ]
    const result = groupPagesByStudent(pages, keys)
    expect(result.filter((g) => g.name !== '')).toHaveLength(2)
  })

  it('이름 없는 페이지 → 미분류 그룹', () => {
    const pages = [
      makePage('p1', '홍길동', '수학 중간고사'),
      makePage('p2'), // no OCR result
    ]
    const result = groupPagesByStudent(pages, keys)
    const unclassified = result.find((g) => g.name === '')
    expect(unclassified).toBeDefined()
    expect(unclassified!.pages).toHaveLength(1)
  })
})

describe('groupPagesByFixedCount', () => {
  it('6페이지 + n=2 → 3그룹', () => {
    const pages = Array.from({ length: 6 }, (_, i) => makePage(`p${i}`))
    const result = groupPagesByFixedCount(pages, 2)
    expect(result).toHaveLength(3)
    expect(result[0]).toHaveLength(2)
  })

  it('7페이지 + n=2 → 3그룹(2장) + 1그룹(1장)', () => {
    const pages = Array.from({ length: 7 }, (_, i) => makePage(`p${i}`))
    const result = groupPagesByFixedCount(pages, 2)
    expect(result).toHaveLength(4)
    expect(result[3]).toHaveLength(1)
  })

  it('빈 배열 → 빈 결과', () => {
    expect(groupPagesByFixedCount([], 2)).toHaveLength(0)
  })
})

describe('base64ToFile', () => {
  it('유효한 base64 → File 객체 생성', () => {
    const base64 = btoa('hello world')
    const file = base64ToFile(base64, 'test.txt', 'text/plain')
    expect(file).toBeInstanceOf(File)
    expect(file.size).toBe(11)
  })

  it('파일명, MIME 타입 정확히 설정됨', () => {
    const base64 = btoa('data')
    const file = base64ToFile(base64, 'image.png', 'image/png')
    expect(file.name).toBe('image.png')
    expect(file.type).toBe('image/png')
  })
})
