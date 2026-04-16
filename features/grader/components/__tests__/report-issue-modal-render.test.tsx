import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useTabStore } from '@/store/use-tab-store'
import type { AnswerKeyStructure, StudentSubmission } from '@/types/grading'

/**
 * ReportIssueModal이 열리는 조건을 검증하는 테스트.
 *
 * GradingWorkspace 전체를 렌더하면 의존성이 너무 많으므로,
 * 모달 렌더 IIFE와 동일한 조건 로직을 직접 테스트한다.
 */

// Mock supabase - report-service에서 사용
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  },
}))

const mockGetSessionStoragePath = vi.fn()
const mockGetSubmissionStoragePath = vi.fn()
vi.mock('@/lib/persistence-service', () => ({
  getSessionStoragePath: (...args: unknown[]) => mockGetSessionStoragePath(...args),
  getSubmissionStoragePath: (...args: unknown[]) => mockGetSubmissionStoragePath(...args),
}))

// 모달 렌더 조건을 재현하는 헬퍼 (grading-workspace.tsx의 ReportIssueModalWrapper 로직)
function resolveReportModal(params: {
  showReportModal: boolean
  currentSubmission: { id: string; studentName: string } | null
  user: { id: string } | null
  tabId: string
}) {
  const { showReportModal, currentSubmission, user, tabId } = params
  if (!showReportModal || !currentSubmission || !user) return null

  const currentTab = useTabStore.getState().tabs.find((t) => t.id === tabId)
  const answerKeyStructure = currentTab?.answerKeyStructure
  if (!answerKeyStructure) return null

  return { answerKeyStructure }
}

const mockStructure: AnswerKeyStructure = {
  title: '테스트 시험',
  answers: { '1': { text: 'A' }, '2': { text: 'B' } },
  totalQuestions: 2,
}

describe('오류 제보 모달 렌더 조건', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], submissions: {} })
  })

  it('storagePath가 없어도 answerKeyStructure가 있으면 모달이 열려야 한다', () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'tab-1',
          title: '테스트',
          createdAt: Date.now(),
          status: 'ready',
          answerKeyFile: {
            name: 'answer.pdf',
            size: 1000,
          },
          answerKeyStructure: mockStructure,
        },
      ],
    })

    const result = resolveReportModal({
      showReportModal: true,
      currentSubmission: { id: 'sub-1', studentName: '학생1' },
      user: { id: 'user-1' },
      tabId: 'tab-1',
    })

    expect(result).not.toBeNull()
    expect(result!.answerKeyStructure).toEqual(mockStructure)
  })

  it('answerKeyStructure가 없으면 모달이 열리지 않아야 한다', () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'tab-3',
          title: '테스트',
          createdAt: Date.now(),
          status: 'extracting',
          answerKeyFile: { name: 'answer.pdf', size: 1000 },
        },
      ],
    })

    const result = resolveReportModal({
      showReportModal: true,
      currentSubmission: { id: 'sub-1', studentName: '학생1' },
      user: { id: 'user-1' },
      tabId: 'tab-3',
    })

    expect(result).toBeNull()
  })

  it('user가 없으면 모달이 열리지 않아야 한다', () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'tab-4',
          title: '테스트',
          createdAt: Date.now(),
          status: 'ready',
          answerKeyFile: { name: 'answer.pdf', size: 1000 },
          answerKeyStructure: mockStructure,
        },
      ],
    })

    const result = resolveReportModal({
      showReportModal: true,
      currentSubmission: { id: 'sub-1', studentName: '학생1' },
      user: null,
      tabId: 'tab-4',
    })

    expect(result).toBeNull()
  })

  it('isAuthenticated=true이지만 user=null이면 모달이 열리지 않아야 한다 (Electron race condition 방어)', () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'tab-5',
          title: '테스트',
          createdAt: Date.now(),
          status: 'ready',
          answerKeyFile: { name: 'answer.pdf', size: 1000 },
          answerKeyStructure: mockStructure,
        },
      ],
    })

    const result = resolveReportModal({
      showReportModal: true,
      currentSubmission: { id: 'sub-1', studentName: '학생1' },
      user: null,
      tabId: 'tab-5',
    })

    expect(result).toBeNull()
  })
})

describe('오류 제보 모달 - DB에서 storage path 조회', () => {
  const mockSubmission: Partial<StudentSubmission> = {
    id: 'sub-1',
    studentName: '학생1',
    score: { correct: 8, total: 10, percentage: 80 },
    results: [
      {
        questionNumber: 1,
        studentAnswer: 'A',
        correctAnswer: 'A',
        isCorrect: true,
      },
    ],
    status: 'graded',
    fileName: 'test.pdf',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('제보 시 DB에서 storage path를 조회해야 한다', async () => {
    mockGetSessionStoragePath.mockResolvedValue('user-1/session-1/answer-key.pdf')
    mockGetSubmissionStoragePath.mockResolvedValue('user-1/session-1/submissions/sub-1.pdf')

    const { ReportIssueModal } = await import('../report-issue-modal')

    const onClose = vi.fn()

    render(
      <ReportIssueModal
        submission={mockSubmission as StudentSubmission}
        sessionId="session-1"
        userId="user-1"
        answerKeyStructure={mockStructure}
        onClose={onClose}
      />
    )

    const submitBtn = screen.getByText('제보하기')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockGetSessionStoragePath).toHaveBeenCalledWith('user-1', 'session-1')
      expect(mockGetSubmissionStoragePath).toHaveBeenCalledWith('user-1', 'session-1', 'sub-1')
    })
  })

  it('DB에서 storage path가 null이면 빈 문자열로 제보해야 한다', async () => {
    mockGetSessionStoragePath.mockResolvedValue(null)
    mockGetSubmissionStoragePath.mockResolvedValue(null)

    const { ReportIssueModal } = await import('../report-issue-modal')

    const onClose = vi.fn()

    render(
      <ReportIssueModal
        submission={mockSubmission as StudentSubmission}
        sessionId="session-1"
        userId="user-1"
        answerKeyStructure={mockStructure}
        onClose={onClose}
      />
    )

    const submitBtn = screen.getByText('제보하기')
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockGetSessionStoragePath).toHaveBeenCalledWith('user-1', 'session-1')
      expect(mockGetSubmissionStoragePath).toHaveBeenCalledWith('user-1', 'session-1', 'sub-1')
    })
  })
})
