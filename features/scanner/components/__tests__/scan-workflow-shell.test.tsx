import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScanWorkflowShell } from '../scan-workflow-shell'
import { useScanStore } from '@/store/use-scan-store'

// Mock child components to capture props and simulate callbacks
vi.mock('../answer-key-management', () => ({
  AnswerKeyManagement: () => <div data-testid="answer-key-management">AnswerKeyManagement</div>,
}))

vi.mock('../batch-scan-modal', () => ({
  BatchScanModal: ({ open, onClose, onScanComplete }: any) => (
    <div data-testid="batch-scan-modal">
      <button data-testid="scan-modal-close" onClick={onClose}>
        Close
      </button>
      <button data-testid="scan-modal-complete" onClick={onScanComplete}>
        Complete Scan
      </button>
    </div>
  ),
}))

vi.mock('../classification-progress', () => ({
  ClassificationProgress: ({ onComplete }: any) => (
    <div data-testid="classification-progress">
      <button data-testid="classification-complete" onClick={onComplete}>
        Complete Classification
      </button>
    </div>
  ),
}))

vi.mock('../classification-review', () => ({
  ClassificationReview: ({ onCommit, onBack, onRescan }: any) => (
    <div data-testid="classification-review">
      <button data-testid="review-commit" onClick={() => onCommit([])}>
        Commit
      </button>
      <button data-testid="review-back" onClick={onBack}>
        Back
      </button>
      <button data-testid="review-rescan" onClick={onRescan}>
        Rescan
      </button>
    </div>
  ),
}))

// Mock the scanner availability hook used indirectly
vi.mock('../../hooks/use-scanner-availability', () => ({
  useScannerAvailability: () => ({ available: true, isElectron: true }),
}))

describe('ScanWorkflowShell', () => {
  beforeEach(() => {
    // Reset scan store
    useScanStore.setState({
      isScanWorkflowOpen: true,
      answerKeys: [
        {
          id: 'key-1',
          title: '수학 기말고사',
          files: [new File([''], 'math.pdf')],
          structure: { title: '수학 기말고사', answers: {}, totalQuestions: 10 },
          createdAt: Date.now(),
        },
      ],
      scannedPages: [],
      classifiedStudents: [],
      activeScanSession: null,
    })
  })

  describe('스텝 전환', () => {
    it('초기 스텝 = answer-keys', () => {
      render(<ScanWorkflowShell />)
      expect(screen.getByTestId('answer-key-management')).toBeInTheDocument()
    })

    it('정답지 등록 완료 → scan-config로 전환', () => {
      render(<ScanWorkflowShell />)
      // Click "다음" button
      const nextBtn = screen.getByRole('button', { name: /다음/ })
      fireEvent.click(nextBtn)
      expect(screen.getByTestId('batch-scan-modal')).toBeInTheDocument()
    })

    it('스캔 완료 → classifying으로 전환', () => {
      render(<ScanWorkflowShell />)
      // Go to scan-config
      fireEvent.click(screen.getByRole('button', { name: /다음/ }))
      // Complete scan
      fireEvent.click(screen.getByTestId('scan-modal-complete'))
      expect(screen.getByTestId('classification-progress')).toBeInTheDocument()
    })

    it('분류 완료 → reviewing으로 전환', () => {
      render(<ScanWorkflowShell />)
      fireEvent.click(screen.getByRole('button', { name: /다음/ }))
      fireEvent.click(screen.getByTestId('scan-modal-complete'))
      fireEvent.click(screen.getByTestId('classification-complete'))
      expect(screen.getByTestId('classification-review')).toBeInTheDocument()
    })
  })

  describe('닫기 제어', () => {
    it('answer-keys 스텝에서 닫기 → 가능', () => {
      render(<ScanWorkflowShell />)
      const closeBtn = screen.getByLabelText('닫기')
      expect(closeBtn).not.toBeDisabled()
    })

    it('scanning 스텝에서 닫기 → 비활성화', () => {
      render(<ScanWorkflowShell />)
      fireEvent.click(screen.getByRole('button', { name: /다음/ }))
      // Now in scan-config step — close should be disabled
      const closeBtn = screen.getByLabelText('닫기')
      expect(closeBtn).toBeDisabled()
    })

    it('reviewing 스텝에서 닫기 → 가능', () => {
      render(<ScanWorkflowShell />)
      fireEvent.click(screen.getByRole('button', { name: /다음/ }))
      fireEvent.click(screen.getByTestId('scan-modal-complete'))
      fireEvent.click(screen.getByTestId('classification-complete'))
      const closeBtn = screen.getByLabelText('닫기')
      expect(closeBtn).not.toBeDisabled()
    })
  })

  describe('되돌아가기', () => {
    it('reviewing에서 "이전 단계로" → classifying', () => {
      render(<ScanWorkflowShell />)
      fireEvent.click(screen.getByRole('button', { name: /다음/ }))
      fireEvent.click(screen.getByTestId('scan-modal-complete'))
      fireEvent.click(screen.getByTestId('classification-complete'))
      // Now in reviewing
      fireEvent.click(screen.getByTestId('review-back'))
      expect(screen.getByTestId('classification-progress')).toBeInTheDocument()
    })

    it('reviewing에서 "다시 스캔" → scan-config', () => {
      render(<ScanWorkflowShell />)
      fireEvent.click(screen.getByRole('button', { name: /다음/ }))
      fireEvent.click(screen.getByTestId('scan-modal-complete'))
      fireEvent.click(screen.getByTestId('classification-complete'))
      // Now in reviewing
      fireEvent.click(screen.getByTestId('review-rescan'))
      // resetSession clears data, openWorkflow re-opens, step goes to scan-config
      expect(screen.getByTestId('batch-scan-modal')).toBeInTheDocument()
    })
  })

  it('isScanWorkflowOpen이 false이면 렌더링하지 않음', () => {
    useScanStore.setState({ isScanWorkflowOpen: false })
    const { container } = render(<ScanWorkflowShell />)
    expect(container.innerHTML).toBe('')
  })

  describe('커밋 후 닫기 제어', () => {
    function goToReviewStep() {
      fireEvent.click(screen.getByRole('button', { name: /다음/ }))
      fireEvent.click(screen.getByTestId('scan-modal-complete'))
      fireEvent.click(screen.getByTestId('classification-complete'))
    }

    it('onGradeStart가 0 반환 → 워크플로우 닫히지 않음', () => {
      const onGradeStart = vi.fn().mockReturnValue(0)
      render(<ScanWorkflowShell onGradeStart={onGradeStart} />)
      goToReviewStep()

      fireEvent.click(screen.getByTestId('review-commit'))

      expect(onGradeStart).toHaveBeenCalled()
      // 워크플로우가 여전히 열려 있어야 함
      expect(screen.getByTestId('classification-review')).toBeInTheDocument()
    })

    it('onGradeStart가 1 이상 반환 → 워크플로우 정상 닫힘', () => {
      const onGradeStart = vi.fn().mockReturnValue(2)
      render(<ScanWorkflowShell onGradeStart={onGradeStart} />)
      goToReviewStep()

      fireEvent.click(screen.getByTestId('review-commit'))

      expect(onGradeStart).toHaveBeenCalled()
      // 워크플로우가 닫혀야 함 (isScanWorkflowOpen=false로 설정됨)
      expect(screen.queryByTestId('classification-review')).not.toBeInTheDocument()
    })

    it('onGradeStart가 0 반환 → alert 표시', () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
      const onGradeStart = vi.fn().mockReturnValue(0)
      render(<ScanWorkflowShell onGradeStart={onGradeStart} />)
      goToReviewStep()

      fireEvent.click(screen.getByTestId('review-commit'))

      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringContaining('탭을 생성할 수 없습니다')
      )
      alertSpy.mockRestore()
    })
  })
})
