import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AnswerKeyManagement } from '../answer-key-management'
import { useScanStore } from '@/store/use-scan-store'

// Mock scanner availability
vi.mock('../../hooks/use-scanner-availability', () => ({
  useScannerAvailability: () => ({ available: true, isElectron: true, devices: [] }),
}))

// Mock grading service
vi.mock('@/lib/grading-service', () => ({
  extractAnswerStructure: vi.fn(),
}))

// Need to import after mock
import { extractAnswerStructure } from '@/lib/grading-service'

describe('AnswerKeyManagement', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    useScanStore.setState({
      answerKeys: [],
      addAnswerKey: vi.fn(),
      removeAnswerKey: vi.fn(),
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    alertSpy.mockRestore()
  })

  // Helper to set up scanner mocks for success case
  function setupScannerSuccess() {
    const scanMock = vi.fn().mockResolvedValue({ filePath: '/tmp/scan.pdf', mimeType: 'application/pdf' })
    const readMock = vi.fn().mockResolvedValue(btoa('fake-pdf-content'))
    const cleanupMock = vi.fn().mockResolvedValue(undefined)

    window.electronAPI = {
      ...window.electronAPI!,
      scanner: {
        ...window.electronAPI!.scanner,
        scan: scanMock,
        readScanFile: readMock,
        cleanupScanFile: cleanupMock,
      },
    } as any

    return { scanMock, readMock, cleanupMock }
  }

  it('스캔 성공 → 정답지 등록', async () => {
    const { scanMock, readMock, cleanupMock } = setupScannerSuccess()
    const mockStructure = { title: '수학 시험', answers: { '1': { text: '①' } }, totalQuestions: 1 }
    vi.mocked(extractAnswerStructure).mockResolvedValue(mockStructure)

    const addAnswerKey = vi.fn()
    useScanStore.setState({ addAnswerKey })

    render(<AnswerKeyManagement />)
    fireEvent.click(screen.getByRole('button', { name: /스캐너로 스캔/ }))

    await waitFor(() => {
      expect(scanMock).toHaveBeenCalled()
      expect(readMock).toHaveBeenCalledWith('/tmp/scan.pdf')
      expect(extractAnswerStructure).toHaveBeenCalled()
      expect(addAnswerKey).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '수학 시험',
          structure: mockStructure,
        })
      )
      expect(cleanupMock).toHaveBeenCalledWith('/tmp/scan.pdf')
    })
  })

  it('문서 없음 에러 → alert 표시', async () => {
    window.electronAPI = {
      ...window.electronAPI!,
      scanner: {
        ...window.electronAPI!.scanner,
        scan: vi.fn().mockRejectedValue(new Error('output file not found')),
      },
    } as any

    render(<AnswerKeyManagement />)
    fireEvent.click(screen.getByRole('button', { name: /스캐너로 스캔/ }))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringContaining('문서가 감지되지 않았습니다')
      )
    })
  })

  it('타임아웃 에러 → alert 표시', async () => {
    window.electronAPI = {
      ...window.electronAPI!,
      scanner: {
        ...window.electronAPI!.scanner,
        scan: vi.fn().mockRejectedValue(new Error('Scan timed out')),
      },
    } as any

    render(<AnswerKeyManagement />)
    fireEvent.click(screen.getByRole('button', { name: /스캐너로 스캔/ }))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringContaining('시간이 초과')
      )
    })
  })

  it('중복 스캔 에러 → alert 표시', async () => {
    window.electronAPI = {
      ...window.electronAPI!,
      scanner: {
        ...window.electronAPI!.scanner,
        scan: vi.fn().mockRejectedValue(new Error('Scan already in progress')),
      },
    } as any

    render(<AnswerKeyManagement />)
    fireEvent.click(screen.getByRole('button', { name: /스캐너로 스캔/ }))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringContaining('이미 스캔이 진행 중')
      )
    })
  })

  it('기타 에러 → 일반 alert', async () => {
    window.electronAPI = {
      ...window.electronAPI!,
      scanner: {
        ...window.electronAPI!.scanner,
        scan: vi.fn().mockRejectedValue(new Error('Unknown error')),
      },
    } as any

    render(<AnswerKeyManagement />)
    fireEvent.click(screen.getByRole('button', { name: /스캐너로 스캔/ }))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringContaining('스캐너 연결 상태를 확인')
      )
    })
  })

  it('스캔 중 로딩 표시 → 완료 후 제거', async () => {
    // Use a deferred promise to control scan timing
    let resolveScan: (value: any) => void
    const scanPromise = new Promise((resolve) => { resolveScan = resolve })

    window.electronAPI = {
      ...window.electronAPI!,
      scanner: {
        ...window.electronAPI!.scanner,
        scan: vi.fn().mockReturnValue(scanPromise),
        readScanFile: vi.fn().mockResolvedValue(btoa('content')),
        cleanupScanFile: vi.fn().mockResolvedValue(undefined),
      },
    } as any

    const mockStructure = { title: 'Test', answers: {}, totalQuestions: 0 }
    vi.mocked(extractAnswerStructure).mockResolvedValue(mockStructure)
    useScanStore.setState({ addAnswerKey: vi.fn() })

    render(<AnswerKeyManagement />)
    fireEvent.click(screen.getByRole('button', { name: /스캐너로 스캔/ }))

    // Loading indicator should appear
    await waitFor(() => {
      expect(screen.getByText('스캐너 스캔 중...')).toBeInTheDocument()
    })

    // Resolve the scan
    resolveScan!({ filePath: '/tmp/scan.pdf', mimeType: 'application/pdf' })

    // Loading indicator should disappear
    await waitFor(() => {
      expect(screen.queryByText('스캐너 스캔 중...')).not.toBeInTheDocument()
    })
  })
})
