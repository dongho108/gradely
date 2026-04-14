import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GradingResultPanel } from '../grading-result-panel'
import type { StudentSubmission, QuestionResult } from '@/types/grading'

function makeResult(overrides: Partial<QuestionResult> & { questionNumber: number }): QuestionResult {
  return {
    studentAnswer: '2',
    correctAnswer: '3',
    isCorrect: false,
    ...overrides,
  }
}

function makeSubmission(results: QuestionResult[]): StudentSubmission {
  const correct = results.filter(r => r.isCorrect).length
  const total = results.length
  return {
    id: 'sub-1',
    studentName: '홍길동',
    fileName: 'test.pdf',
    status: 'graded',
    uploadedAt: Date.now(),
    score: { correct, total, percentage: (correct / total) * 100 },
    results,
  }
}

const mixedResults: QuestionResult[] = [
  makeResult({ questionNumber: 1, studentAnswer: '1', correctAnswer: '1', isCorrect: true }),
  makeResult({ questionNumber: 2, studentAnswer: '2', correctAnswer: '3', isCorrect: false }),
  makeResult({ questionNumber: 3, studentAnswer: '4', correctAnswer: '4', isCorrect: true }),
  makeResult({ questionNumber: 4, studentAnswer: '1', correctAnswer: '2', isCorrect: false }),
  makeResult({ questionNumber: 5, studentAnswer: '3', correctAnswer: '3', isCorrect: true }),
]

const allCorrectResults: QuestionResult[] = [
  makeResult({ questionNumber: 1, studentAnswer: '1', correctAnswer: '1', isCorrect: true }),
  makeResult({ questionNumber: 2, studentAnswer: '2', correctAnswer: '2', isCorrect: true }),
  makeResult({ questionNumber: 3, studentAnswer: '3', correctAnswer: '3', isCorrect: true }),
]

describe('GradingResultPanel - 틀린 것만 보기 토글', () => {
  it('기본 상태에서 모든 문제가 표시된다', () => {
    render(<GradingResultPanel submission={makeSubmission(mixedResults)} />)

    // 5개 문제 모두 표시
    expect(screen.getAllByRole('row')).toHaveLength(5 + 1) // +1 for header row
  })

  it('토글 ON 시 오답만 표시된다', () => {
    render(<GradingResultPanel submission={makeSubmission(mixedResults)} />)

    const toggle = screen.getByRole('button', { name: /틀린 것만/i })
    fireEvent.click(toggle)

    // 오답 2개 + 헤더 1개
    expect(screen.getAllByRole('row')).toHaveLength(2 + 1)
  })

  it('토글 OFF 시 다시 전체 문제가 표시된다', () => {
    render(<GradingResultPanel submission={makeSubmission(mixedResults)} />)

    const toggle = screen.getByRole('button', { name: /틀린 것만/i })
    fireEvent.click(toggle) // ON
    fireEvent.click(toggle) // OFF

    expect(screen.getAllByRole('row')).toHaveLength(5 + 1)
  })

  it('전부 정답일 때 토글 ON 시 빈 상태 메시지가 표시된다', () => {
    render(<GradingResultPanel submission={makeSubmission(allCorrectResults)} />)

    const toggle = screen.getByRole('button', { name: /틀린 것만/i })
    fireEvent.click(toggle)

    expect(screen.getByText(/모든 문제를 맞혔습니다/)).toBeInTheDocument()
  })
})
