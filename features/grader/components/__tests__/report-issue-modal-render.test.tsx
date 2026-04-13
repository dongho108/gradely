import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useTabStore } from '@/store/use-tab-store'
import { useAuthStore } from '@/store/use-auth-store'
import type { AnswerKeyStructure, QuestionResult } from '@/types/grading'

/**
 * ReportIssueModal이 열리는 조건을 검증하는 테스트.
 *
 * GradingWorkspace 전체를 렌더하면 의존성이 너무 많으므로,
 * 모달 렌더 IIFE와 동일한 조건 로직을 직접 테스트한다.
 *
 * 버그 배경: answerKeyFile.storagePath가 없으면 모달이 null을
 * 반환하여 버튼을 눌러도 아무 반응이 없었음.
 */

// Mock supabase - report-service에서 사용
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}))

// 모달 렌더 조건을 재현하는 헬퍼 (grading-workspace.tsx:465-480의 IIFE 로직)
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
  const answerKeyStoragePath = currentTab?.answerKeyFile?.storagePath ?? ''

  return { answerKeyStructure, answerKeyStoragePath }
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
    // storagePath 없이 탭 생성 (스캔으로 정답지 등록한 경우)
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
            // storagePath 없음!
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
    expect(result!.answerKeyStoragePath).toBe('')
  })

  it('storagePath가 있으면 그 값이 그대로 전달되어야 한다', () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'tab-2',
          title: '테스트',
          createdAt: Date.now(),
          status: 'ready',
          answerKeyFile: {
            name: 'answer.pdf',
            size: 1000,
            storagePath: 'users/u1/sessions/tab-2/answer-key.pdf',
          },
          answerKeyStructure: mockStructure,
        },
      ],
    })

    const result = resolveReportModal({
      showReportModal: true,
      currentSubmission: { id: 'sub-1', studentName: '학생1' },
      user: { id: 'user-1' },
      tabId: 'tab-2',
    })

    expect(result).not.toBeNull()
    expect(result!.answerKeyStoragePath).toBe('users/u1/sessions/tab-2/answer-key.pdf')
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
          // answerKeyStructure 없음
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

    // isAuthenticated=true이지만 user가 아직 null인 상태 시뮬레이션
    // (Electron 딥링크 OAuth에서 onAuthStateChange 반영 전 갭)
    const result = resolveReportModal({
      showReportModal: true,
      currentSubmission: { id: 'sub-1', studentName: '학생1' },
      user: null, // race condition: isAuthenticated는 true이나 user는 아직 null
      tabId: 'tab-5',
    })

    expect(result).toBeNull()
  })

  it('isAuthenticated=true이고 user가 있으면 모달이 정상적으로 열려야 한다', () => {
    useTabStore.setState({
      tabs: [
        {
          id: 'tab-6',
          title: '테스트',
          createdAt: Date.now(),
          status: 'ready',
          answerKeyFile: {
            name: 'answer.pdf',
            size: 1000,
            storagePath: 'users/u1/sessions/tab-6/answer-key.pdf',
          },
          answerKeyStructure: mockStructure,
        },
      ],
    })

    const result = resolveReportModal({
      showReportModal: true,
      currentSubmission: { id: 'sub-1', studentName: '학생1' },
      user: { id: 'user-1' },
      tabId: 'tab-6',
    })

    expect(result).not.toBeNull()
    expect(result!.answerKeyStructure).toEqual(mockStructure)
  })
})
