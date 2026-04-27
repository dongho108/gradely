import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AnswerKeyStructure, StudentExamStructure } from '@/types/grading'
import { SNAPSHOT_RESULTS, EXPECTED_REGRADE, type RegradeCategory } from './fixtures/regrade-snapshot'

const mockInvoke = vi.fn()
vi.mock('../supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}))

import { calculateGradingResult } from '../grading-service'

function buildAnswerKey(): AnswerKeyStructure {
  const answers: AnswerKeyStructure['answers'] = {}
  for (const r of SNAPSHOT_RESULTS) {
    answers[String(r.questionNumber)] = { text: r.correctAnswer, question: r.question }
  }
  return { title: '단어 시험', answers, totalQuestions: SNAPSHOT_RESULTS.length }
}

function buildStudentExam(): StudentExamStructure {
  const answers: Record<string, string> = {}
  for (const r of SNAPSHOT_RESULTS) {
    answers[String(r.questionNumber)] = r.studentAnswer
  }
  return { studentName: '재채점 비교', answers, totalQuestions: SNAPSHOT_RESULTS.length }
}

describe('스냅샷 vs lenient 재채점 비교', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('스냅샷 자체 무결성: 50문항, 미작성 없음', () => {
    expect(SNAPSHOT_RESULTS).toHaveLength(50)
    expect(EXPECTED_REGRADE).toHaveLength(50)
    for (const r of SNAPSHOT_RESULTS) {
      expect(r.studentAnswer).not.toBe('(미작성)')
      expect(r.studentAnswer).not.toBe('(판독불가)')
    }
  })

  it('스냅샷 점수: 45/50 정답', () => {
    const correct = SNAPSHOT_RESULTS.filter(r => r.isCorrect).length
    expect(correct).toBe(45)
  })

  it('수동 편집(isEdited)된 정답 처리 6건: 7,16,19,22,25,37', () => {
    const edited = SNAPSHOT_RESULTS.filter(r => r.isEdited).map(r => r.questionNumber)
    expect(edited.sort((a, b) => a - b)).toEqual([7, 16, 19, 22, 25, 37])
  })

  it('카테고리 분포: similar-meaning 3건(6,47,50), wrong 5건(11,31,40,43,49), 합계 50', () => {
    const counts = EXPECTED_REGRADE.reduce<Record<RegradeCategory, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + 1
      return acc
    }, {} as Record<RegradeCategory, number>)

    expect(counts['similar-meaning']).toBe(3)
    expect(counts['wrong']).toBe(5)

    const similarMeaning = EXPECTED_REGRADE.filter(e => e.category === 'similar-meaning').map(e => e.questionNumber)
    const wrong = EXPECTED_REGRADE.filter(e => e.category === 'wrong').map(e => e.questionNumber)
    expect(similarMeaning.sort((a, b) => a - b)).toEqual([6, 47, 50])
    expect(wrong.sort((a, b) => a - b)).toEqual([11, 31, 40, 43, 49])

    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    expect(total).toBe(50)
  })

  it('isEdited 6건은 모두 dict-translation 카테고리 (다의어 사전 번역어)', () => {
    const editedNumbers = SNAPSHOT_RESULTS.filter(r => r.isEdited).map(r => r.questionNumber)
    for (const n of editedNumbers) {
      const expected = EXPECTED_REGRADE.find(e => e.questionNumber === n)!
      expect(expected.category).toBe('dict-translation')
      expect(expected.isCorrect).toBe(true)
    }
  })

  it('lenient 모드 재채점 시 전체 점수: 45/50 유지 (목표)', async () => {
    mockInvoke.mockImplementation((_fn: string, opts: { body: { questions: { id: string }[] } }) => {
      const questions = opts.body.questions
      const data = questions.map(q => {
        const expected = EXPECTED_REGRADE.find(e => e.questionNumber === parseInt(q.id))!
        return { id: q.id, isCorrect: expected.isCorrect, reason: expected.reason }
      })
      return Promise.resolve({ data: { success: true, data }, error: null })
    })

    const result = await calculateGradingResult(
      'regrade-1',
      buildAnswerKey(),
      buildStudentExam(),
      'lenient',
    )

    const expectedCorrect = EXPECTED_REGRADE.filter(e => e.isCorrect).length
    expect(result.score.correct).toBe(expectedCorrect)
    expect(result.score.total).toBe(50)
    expect(result.score.correct).toBe(45)
  })

  it('재채점 시 정답 → 오답으로 뒤집힐 항목: 0건 (목표 — 사용자 정답을 깎지 않음)', async () => {
    mockInvoke.mockImplementation((_fn: string, opts: { body: { questions: { id: string }[] } }) => {
      const questions = opts.body.questions
      const data = questions.map(q => {
        const expected = EXPECTED_REGRADE.find(e => e.questionNumber === parseInt(q.id))!
        return { id: q.id, isCorrect: expected.isCorrect, reason: expected.reason }
      })
      return Promise.resolve({ data: { success: true, data }, error: null })
    })

    const result = await calculateGradingResult(
      'regrade-2',
      buildAnswerKey(),
      buildStudentExam(),
      'lenient',
    )

    const flips: number[] = []
    for (const newR of result.results) {
      const old = SNAPSHOT_RESULTS.find(s => s.questionNumber === newR.questionNumber)!
      if (old.isCorrect && !newR.isCorrect) flips.push(newR.questionNumber)
    }
    expect(flips).toEqual([])
  })

  it('재채점 시 오답 → 정답으로 뒤집힐 항목: 없음 (모든 오답은 의미·번역어 불일치)', async () => {
    mockInvoke.mockImplementation((_fn: string, opts: { body: { questions: { id: string }[] } }) => {
      const questions = opts.body.questions
      const data = questions.map(q => {
        const expected = EXPECTED_REGRADE.find(e => e.questionNumber === parseInt(q.id))!
        return { id: q.id, isCorrect: expected.isCorrect, reason: expected.reason }
      })
      return Promise.resolve({ data: { success: true, data }, error: null })
    })

    const result = await calculateGradingResult(
      'regrade-3',
      buildAnswerKey(),
      buildStudentExam(),
      'lenient',
    )

    const flipsToCorrect: number[] = []
    for (const newR of result.results) {
      const old = SNAPSHOT_RESULTS.find(s => s.questionNumber === newR.questionNumber)!
      if (!old.isCorrect && newR.isCorrect) flipsToCorrect.push(newR.questionNumber)
    }
    expect(flipsToCorrect).toEqual([])
  })

  it('isEdited 6건은 lenient 다의어 규칙으로 자동 정답 처리되어 수동 편집이 불필요해짐', async () => {
    mockInvoke.mockImplementation((_fn: string, opts: { body: { questions: { id: string }[] } }) => {
      const questions = opts.body.questions
      const data = questions.map(q => {
        const expected = EXPECTED_REGRADE.find(e => e.questionNumber === parseInt(q.id))!
        return { id: q.id, isCorrect: expected.isCorrect, reason: expected.reason }
      })
      return Promise.resolve({ data: { success: true, data }, error: null })
    })

    const result = await calculateGradingResult(
      'regrade-4',
      buildAnswerKey(),
      buildStudentExam(),
      'lenient',
    )

    const editedNumbers = SNAPSHOT_RESULTS.filter(r => r.isEdited).map(r => r.questionNumber)
    for (const n of editedNumbers) {
      const newR = result.results.find(r => r.questionNumber === n)!
      expect(newR.isCorrect).toBe(true)
      // calculateGradingResult는 isEdited를 부여하지 않음 → 자동으로 정답 판정됨
      expect(newR.isEdited).toBeUndefined()
      expect(newR.aiReason).toBeDefined()
    }
  })

  it('AI에 전송되는 systemPrompt는 lenient 프롬프트 (한↔영 사전 번역어 규칙 포함)', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        data: SNAPSHOT_RESULTS.map(r => ({ id: String(r.questionNumber), isCorrect: r.isCorrect, reason: 'test' })),
      },
      error: null,
    })

    await calculateGradingResult('regrade-5', buildAnswerKey(), buildStudentExam(), 'lenient')

    expect(mockInvoke).toHaveBeenCalledWith('verify-semantic-grading-v2', expect.objectContaining({
      body: expect.objectContaining({ systemPrompt: expect.stringContaining('사전 번역어') }),
    }))
  })

  it('AI에 전송되는 questions 페이로드: 로컬 불일치 항목만 포함하며 구조가 올바르다', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        data: SNAPSHOT_RESULTS.map(r => ({ id: String(r.questionNumber), isCorrect: r.isCorrect, reason: 'ok' })),
      },
      error: null,
    })

    await calculateGradingResult('regrade-6', buildAnswerKey(), buildStudentExam(), 'lenient')

    const call = mockInvoke.mock.calls[0]
    const payload = call[1] as { body: { questions: { id: string; studentAnswer: string; correctAnswer: string; question?: string }[] } }
    // 로컬 매칭된 항목은 제외되므로 길이가 50보다 작거나 같음
    expect(payload.body.questions.length).toBeLessThanOrEqual(50)
    expect(payload.body.questions.length).toBeGreaterThan(0)
    for (const q of payload.body.questions) {
      const snap = SNAPSHOT_RESULTS.find(r => String(r.questionNumber) === q.id)!
      expect(q.studentAnswer).toBe(snap.studentAnswer)
      expect(q.correctAnswer).toBe(snap.correctAnswer)
      expect(q.question).toBe(snap.question)
    }
  })

  it('AI 호출 실패 시 로컬 매칭 fallback: 정확 일치만 정답 처리', async () => {
    mockInvoke.mockRejectedValue(new Error('Network down'))

    const result = await calculateGradingResult(
      'regrade-fallback',
      buildAnswerKey(),
      buildStudentExam(),
      'lenient',
    )

    // 로컬 정규화(공백/괄호 제거, 소문자) 매칭으로 정답 처리되는 항목만 카운트
    // 정확 일치: 2,3,5,8,9,14,17(괄호 정규화 후 일치 아님 — 학생 "이어버드" vs 정답 "이어버드(귀 안에 넣는 이어폰)" → 정규화 후 불일치),
    // 18,23,24(공백 차이),27,30,32(복수 정답 중 일치 아님 - 정규화 차이),36,38,41,46(복수 정답 중 일치 아님)
    // → 실제 동작에 의존하지 않고 일부 명확 케이스만 검증
    expect(result.results.find(r => r.questionNumber === 2)?.isCorrect).toBe(true)  // 향상하다 = 향상하다
    expect(result.results.find(r => r.questionNumber === 8)?.isCorrect).toBe(true)  // 활성화하다 = 활성화하다
    expect(result.results.find(r => r.questionNumber === 6)?.isCorrect).toBe(false) // ~에 익숙해지다 ≠ ~에 적응하다
    expect(result.results.find(r => r.questionNumber === 7)?.isCorrect).toBe(false) // 잠기다 ≠ 고정되다 (수동 편집 효과 사라짐)
    expect(result.results.find(r => r.questionNumber === 11)?.isCorrect).toBe(false)
  })
})
