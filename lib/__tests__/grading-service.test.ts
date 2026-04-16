import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AnswerKeyStructure, StudentExamStructure } from '@/types/grading'

// Mock supabase
const mockInvoke = vi.fn()
vi.mock('../supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}))

// Import after mock setup
import { calculateGradingResult, recalculateAfterEdit, isAnswerCorrect } from '../grading-service'

function makeAnswerKey(answers: Record<string, { text: string; question?: string }>): AnswerKeyStructure {
  return {
    title: 'Test Exam',
    answers,
    totalQuestions: Object.keys(answers).length,
  }
}

function makeStudentExam(answers: Record<string, string>, studentName = '홍길동'): StudentExamStructure {
  return {
    studentName,
    answers,
    totalQuestions: Object.keys(answers).length,
  }
}

describe('isAnswerCorrect (local fallback)', () => {
  it('정규화 후 정확히 일치하면 true', () => {
    expect(isAnswerCorrect('Hello', 'hello')).toBe(true)
  })

  it('공백/괄호 제거 후 일치하면 true', () => {
    expect(isAnswerCorrect(' (hello) ', 'hello')).toBe(true)
  })

  it('|||로 구분된 복수 정답 지원', () => {
    expect(isAnswerCorrect('happy', 'glad|||happy|||joyful')).toBe(true)
  })

  it('일치하지 않으면 false', () => {
    expect(isAnswerCorrect('cat', 'dog')).toBe(false)
  })

  it('빈 문자열은 false', () => {
    expect(isAnswerCorrect('', '')).toBe(false)
  })
})

describe('calculateGradingResult', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('미작성/판독불가는 AI 호출 없이 즉시 오답 처리', async () => {
    const answerKey = makeAnswerKey({
      '1': { text: 'apple' },
      '2': { text: 'banana' },
    })
    const studentExam = makeStudentExam({
      '1': '(미작성)',
      '2': '(판독불가)',
    })

    mockInvoke.mockResolvedValue({ data: null, error: new Error('should not be called') })

    const result = await calculateGradingResult('sub-1', answerKey, studentExam)

    // AI가 호출되지 않아야 함 (모두 미작성/판독불가)
    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result.score.correct).toBe(0)
    expect(result.score.total).toBe(2)
    expect(result.results.every(r => !r.isCorrect)).toBe(true)
  })

  it('작성된 문항은 모두 AI에 전송하고 결과를 반영', async () => {
    const answerKey = makeAnswerKey({
      '1': { text: 'happy', question: 'What does 행복한 mean?' },
      '2': { text: '책임감 있는', question: 'responsible' },
      '3': { text: 'Paris' },
    })
    const studentExam = makeStudentExam({
      '1': 'glad',
      '2': '책임감있는',
      '3': '파리',
    })

    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        data: [
          { id: '1', isCorrect: true, reason: '동의어' },
          { id: '2', isCorrect: true, reason: '의미 동일' },
          { id: '3', isCorrect: true, reason: '영한 번역 일치' },
        ],
      },
      error: null,
    })

    const result = await calculateGradingResult('sub-2', answerKey, studentExam)

    expect(mockInvoke).toHaveBeenCalledWith('verify-semantic-grading', {
      body: {
        questions: [
          { id: '1', studentAnswer: 'glad', correctAnswer: 'happy', question: 'What does 행복한 mean?' },
          { id: '2', studentAnswer: '책임감있는', correctAnswer: '책임감 있는', question: 'responsible' },
          { id: '3', studentAnswer: '파리', correctAnswer: 'Paris', question: undefined },
        ],
        strictness: 'standard',
      },
    })
    expect(result.score.correct).toBe(3)
    expect(result.results[0].aiReason).toBe('동의어')
    expect(result.results[2].aiReason).toBe('영한 번역 일치')
  })

  it('AI가 오답으로 판정하면 isCorrect가 false', async () => {
    const answerKey = makeAnswerKey({
      '1': { text: 'affect' },
    })
    const studentExam = makeStudentExam({ '1': 'effect' })

    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        data: [{ id: '1', isCorrect: false, reason: '다른 단어' }],
      },
      error: null,
    })

    const result = await calculateGradingResult('sub-3', answerKey, studentExam)

    expect(result.score.correct).toBe(0)
    expect(result.results[0].isCorrect).toBe(false)
    expect(result.results[0].aiReason).toBe('다른 단어')
  })

  it('AI 실패 시 로컬 매칭으로 fallback', async () => {
    const answerKey = makeAnswerKey({
      '1': { text: 'apple' },
      '2': { text: 'banana' },
    })
    const studentExam = makeStudentExam({
      '1': 'apple',
      '2': 'orange',
    })

    mockInvoke.mockRejectedValue(new Error('Network error'))

    const result = await calculateGradingResult('sub-4', answerKey, studentExam)

    // fallback으로 로컬 매칭: apple=apple(정답), orange≠banana(오답)
    expect(result.score.correct).toBe(1)
    expect(result.results.find(r => r.questionNumber === 1)?.isCorrect).toBe(true)
    expect(result.results.find(r => r.questionNumber === 2)?.isCorrect).toBe(false)
  })

  it('AI가 success:false 반환 시에도 fallback', async () => {
    const answerKey = makeAnswerKey({ '1': { text: 'hello' } })
    const studentExam = makeStudentExam({ '1': 'hello' })

    mockInvoke.mockResolvedValue({
      data: { success: false, error: 'API error' },
      error: null,
    })

    const result = await calculateGradingResult('sub-5', answerKey, studentExam)

    expect(result.score.correct).toBe(1) // fallback local match
  })

  it('미작성과 작성 문항이 혼합된 경우 올바르게 처리', async () => {
    const answerKey = makeAnswerKey({
      '1': { text: 'dog' },
      '2': { text: 'cat' },
      '3': { text: 'bird' },
    })
    const studentExam = makeStudentExam({
      '1': 'dog',
      '2': '(미작성)',
      // '3' is missing → defaults to (미작성)
    })

    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        data: [{ id: '1', isCorrect: true, reason: '정확 일치' }],
      },
      error: null,
    })

    const result = await calculateGradingResult('sub-6', answerKey, studentExam)

    // Q1: AI 정답, Q2: 미작성 오답, Q3: 미작성 오답
    expect(result.score.correct).toBe(1)
    expect(result.score.total).toBe(3)
    // AI는 Q1만 전송받아야 함
    expect(mockInvoke).toHaveBeenCalledWith('verify-semantic-grading', {
      body: {
        questions: [{ id: '1', studentAnswer: 'dog', correctAnswer: 'dog', question: undefined }],
        strictness: 'standard',
      },
    })
  })
})

describe('calculateGradingResult with strictness', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('strict 모드: AI 호출 없이 로컬 텍스트 비교만 수행', async () => {
    const answerKey = makeAnswerKey({
      '1': { text: 'happy' },
      '2': { text: 'apple' },
    })
    const studentExam = makeStudentExam({
      '1': 'glad',   // 동의어지만 텍스트 불일치 → 오답
      '2': 'apple',  // 정확 일치 → 정답
    })

    const result = await calculateGradingResult('sub-strict', answerKey, studentExam, 'strict')

    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result.score.correct).toBe(1)
    expect(result.results.find(r => r.questionNumber === 1)?.isCorrect).toBe(false)
    expect(result.results.find(r => r.questionNumber === 2)?.isCorrect).toBe(true)
  })

  it('strict 모드: 미작성/판독불가도 AI 없이 오답 처리', async () => {
    const answerKey = makeAnswerKey({
      '1': { text: 'dog' },
      '2': { text: 'cat' },
    })
    const studentExam = makeStudentExam({
      '1': '(미작성)',
      '2': 'cat',
    })

    const result = await calculateGradingResult('sub-strict-2', answerKey, studentExam, 'strict')

    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result.score.correct).toBe(1)
  })

  it('standard 모드: AI에 strictness 전달', async () => {
    const answerKey = makeAnswerKey({ '1': { text: 'happy' } })
    const studentExam = makeStudentExam({ '1': 'glad' })

    mockInvoke.mockResolvedValue({
      data: { success: true, data: [{ id: '1', isCorrect: true, reason: '동의어' }] },
      error: null,
    })

    await calculateGradingResult('sub-std', answerKey, studentExam, 'standard')

    expect(mockInvoke).toHaveBeenCalledWith('verify-semantic-grading', {
      body: {
        questions: [{ id: '1', studentAnswer: 'glad', correctAnswer: 'happy', question: undefined }],
        strictness: 'standard',
      },
    })
  })

  it('lenient 모드: AI에 strictness 전달', async () => {
    const answerKey = makeAnswerKey({ '1': { text: '경제 성장' } })
    const studentExam = makeStudentExam({ '1': '경제가 발전함' })

    mockInvoke.mockResolvedValue({
      data: { success: true, data: [{ id: '1', isCorrect: true, reason: '유사 의미' }] },
      error: null,
    })

    await calculateGradingResult('sub-len', answerKey, studentExam, 'lenient')

    expect(mockInvoke).toHaveBeenCalledWith('verify-semantic-grading', {
      body: {
        questions: [{ id: '1', studentAnswer: '경제가 발전함', correctAnswer: '경제 성장', question: undefined }],
        strictness: 'lenient',
      },
    })
  })

  it('strictness 미지정 시 기본값 standard로 동작 (AI 호출)', async () => {
    const answerKey = makeAnswerKey({ '1': { text: 'hello' } })
    const studentExam = makeStudentExam({ '1': 'hi' })

    mockInvoke.mockResolvedValue({
      data: { success: true, data: [{ id: '1', isCorrect: true, reason: '인사' }] },
      error: null,
    })

    await calculateGradingResult('sub-default', answerKey, studentExam)

    expect(mockInvoke).toHaveBeenCalledWith('verify-semantic-grading', {
      body: {
        questions: [{ id: '1', studentAnswer: 'hi', correctAnswer: 'hello', question: undefined }],
        strictness: 'standard',
      },
    })
  })

  it('strict 모드: |||로 구분된 복수 정답 중 하나 일치 시 정답', async () => {
    const answerKey = makeAnswerKey({ '1': { text: 'glad|||happy|||joyful' } })
    const studentExam = makeStudentExam({ '1': 'happy' })

    const result = await calculateGradingResult('sub-strict-multi', answerKey, studentExam, 'strict')

    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result.score.correct).toBe(1)
    expect(result.results[0].isCorrect).toBe(true)
  })

  it('strict 모드: 정규화(공백/괄호 제거) 후 일치 시 정답', async () => {
    const answerKey = makeAnswerKey({ '1': { text: 'hello world' } })
    const studentExam = makeStudentExam({ '1': ' (hello world) ' })

    const result = await calculateGradingResult('sub-strict-norm', answerKey, studentExam, 'strict')

    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result.score.correct).toBe(1)
  })

  it('strict 모드: 대소문자만 다른 경우 정답', async () => {
    const answerKey = makeAnswerKey({ '1': { text: 'Apple' } })
    const studentExam = makeStudentExam({ '1': 'apple' })

    const result = await calculateGradingResult('sub-strict-case', answerKey, studentExam, 'strict')

    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result.score.correct).toBe(1)
  })

  it('strict 모드: 미작성 + 정답 + 오답 혼합 시 정확한 점수 계산', async () => {
    const answerKey = makeAnswerKey({
      '1': { text: 'dog' },
      '2': { text: 'cat' },
      '3': { text: 'bird' },
      '4': { text: 'fish' },
    })
    const studentExam = makeStudentExam({
      '1': 'dog',      // 정답
      '2': '(미작성)',   // 오답 (미작성)
      '3': 'eagle',    // 오답 (불일치)
      '4': 'fish',     // 정답
    })

    const result = await calculateGradingResult('sub-strict-mix', answerKey, studentExam, 'strict')

    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result.score.correct).toBe(2)
    expect(result.score.total).toBe(4)
    expect(result.score.percentage).toBe(50)
  })

  it('lenient 모드: AI 실패 시 로컬 fallback', async () => {
    const answerKey = makeAnswerKey({
      '1': { text: 'apple' },
      '2': { text: 'banana' },
    })
    const studentExam = makeStudentExam({
      '1': 'apple',
      '2': 'orange',
    })

    mockInvoke.mockRejectedValue(new Error('Network error'))

    const result = await calculateGradingResult('sub-len-fallback', answerKey, studentExam, 'lenient')

    expect(result.score.correct).toBe(1)
    expect(result.results.find(r => r.questionNumber === 1)?.isCorrect).toBe(true)
    expect(result.results.find(r => r.questionNumber === 2)?.isCorrect).toBe(false)
  })
})

describe('recalculateAfterEdit with strictness', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('strict 모드: AI 호출 없이 로컬 비교로 재채점', async () => {
    const results = [
      { questionNumber: 1, studentAnswer: 'cat', correctAnswer: 'dog', isCorrect: false },
    ]

    const result = await recalculateAfterEdit('sub-1', results, 1, 'dog', '홍길동', 'strict')

    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result.results[0].isCorrect).toBe(true)
    expect(result.results[0].isEdited).toBe(true)
  })

  it('standard 모드: AI로 재채점하고 strictness 전달', async () => {
    const results = [
      { questionNumber: 1, studentAnswer: 'cat', correctAnswer: 'dog', isCorrect: false },
    ]

    mockInvoke.mockResolvedValue({
      data: { success: true, data: [{ id: '1', isCorrect: true, reason: '수정 후 정답' }] },
      error: null,
    })

    await recalculateAfterEdit('sub-1', results, 1, 'dog', '홍길동', 'standard')

    expect(mockInvoke).toHaveBeenCalledWith('verify-semantic-grading', {
      body: {
        questions: [{
          id: '1',
          studentAnswer: 'dog',
          correctAnswer: 'dog',
          question: undefined,
        }],
        strictness: 'standard',
      },
    })
  })

  it('lenient 모드: AI로 재채점하고 strictness 전달', async () => {
    const results = [
      { questionNumber: 1, studentAnswer: 'cat', correctAnswer: '경제 성장', isCorrect: false },
    ]

    mockInvoke.mockResolvedValue({
      data: { success: true, data: [{ id: '1', isCorrect: true, reason: '유사 의미 허용' }] },
      error: null,
    })

    await recalculateAfterEdit('sub-1', results, 1, '경제가 발전함', '홍길동', 'lenient')

    expect(mockInvoke).toHaveBeenCalledWith('verify-semantic-grading', {
      body: {
        questions: [{
          id: '1',
          studentAnswer: '경제가 발전함',
          correctAnswer: '경제 성장',
          question: undefined,
        }],
        strictness: 'lenient',
      },
    })
  })
})

describe('recalculateAfterEdit', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('수정된 답안을 AI로 재채점', async () => {
    const results = [
      { questionNumber: 1, studentAnswer: 'cat', correctAnswer: 'dog', isCorrect: false },
      { questionNumber: 2, studentAnswer: 'apple', correctAnswer: 'apple', isCorrect: true },
    ]

    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        data: [{ id: '1', isCorrect: true, reason: '수정 후 정답' }],
      },
      error: null,
    })

    const result = await recalculateAfterEdit('sub-1', results, 1, 'dog', '홍길동')

    expect(result.results[0].isCorrect).toBe(true)
    expect(result.results[0].isEdited).toBe(true)
    expect(result.results[0].aiReason).toBe('수정 후 정답')
    expect(result.results[0].studentAnswer).toBe('dog')
    expect(result.score.correct).toBe(2)
  })

  it('AI 실패 시 로컬 매칭 fallback', async () => {
    const results = [
      { questionNumber: 1, studentAnswer: 'cat', correctAnswer: 'dog', isCorrect: false },
    ]

    mockInvoke.mockRejectedValue(new Error('Network error'))

    const result = await recalculateAfterEdit('sub-1', results, 1, 'dog', '홍길동')

    expect(result.results[0].isCorrect).toBe(true) // local match: dog === dog
    expect(result.results[0].isEdited).toBe(true)
  })

  it('미작성으로 수정하면 AI 호출 없이 오답', async () => {
    const results = [
      { questionNumber: 1, studentAnswer: 'dog', correctAnswer: 'dog', isCorrect: true },
    ]

    const result = await recalculateAfterEdit('sub-1', results, 1, '(미작성)', '홍길동')

    expect(mockInvoke).not.toHaveBeenCalled()
    expect(result.results[0].isCorrect).toBe(false)
    expect(result.score.correct).toBe(0)
  })
})
