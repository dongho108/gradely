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

  /** 단일 페이지 스캔 mock (additionalFiles 없음) */
  function setupSinglePageScan() {
    const scanMock = vi.fn().mockResolvedValue({
      filePath: '/tmp/scan-1.jpg',
      mimeType: 'image/jpeg',
    })
    const readMock = vi.fn().mockResolvedValue(btoa('fake-image-content'))
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

  /** ADF 멀티페이지 스캔 mock (additionalFiles 포함) */
  function setupMultiPageScan(pageCount: number) {
    const additionalFiles = pageCount > 1
      ? Array.from({ length: pageCount - 1 }, (_, i) => `/tmp/scan.${i + 2}.jpg`)
      : undefined

    const scanMock = vi.fn().mockResolvedValue({
      filePath: '/tmp/scan.1.jpg',
      mimeType: 'image/jpeg',
      additionalFiles,
    })
    const readMock = vi.fn().mockResolvedValue(btoa('fake-image-content'))
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

  it('스캔 성공 → 정답지 1개 등록 (단일 페이지)', async () => {
    const { scanMock, readMock, cleanupMock } = setupSinglePageScan()
    const mockStructure = { title: '수학 시험', answers: { '1': { text: '①' } }, totalQuestions: 1 }
    vi.mocked(extractAnswerStructure).mockResolvedValue(mockStructure)

    const addAnswerKey = vi.fn()
    useScanStore.setState({ addAnswerKey })

    render(<AnswerKeyManagement />)
    fireEvent.click(screen.getByRole('button', { name: /스캐너로 스캔/ }))

    await waitFor(() => {
      expect(scanMock).toHaveBeenCalledWith(expect.objectContaining({ format: 'jpeg', source: 'feeder' }))
      expect(readMock).toHaveBeenCalledWith('/tmp/scan-1.jpg')
      expect(addAnswerKey).toHaveBeenCalledTimes(1)
      expect(addAnswerKey).toHaveBeenCalledWith(
        expect.objectContaining({ title: '수학 시험', structure: mockStructure })
      )
      expect(cleanupMock).toHaveBeenCalledWith('/tmp/scan-1.jpg')
    })
  })

  it('ADF에 2장 → 정답지 2개 등록 (additionalFiles)', async () => {
    const { scanMock, readMock, cleanupMock } = setupMultiPageScan(2)
    const mockStructure1 = { title: '수학 시험', answers: { '1': { text: '①' } }, totalQuestions: 1 }
    const mockStructure2 = { title: '영어 시험', answers: { '1': { text: '②' } }, totalQuestions: 1 }
    vi.mocked(extractAnswerStructure)
      .mockResolvedValueOnce(mockStructure1)
      .mockResolvedValueOnce(mockStructure2)

    const addAnswerKey = vi.fn()
    useScanStore.setState({ addAnswerKey })

    render(<AnswerKeyManagement />)
    fireEvent.click(screen.getByRole('button', { name: /스캐너로 스캔/ }))

    await waitFor(() => {
      expect(scanMock).toHaveBeenCalledTimes(1) // 단일 호출
      expect(readMock).toHaveBeenCalledTimes(2) // 2개 파일 읽기
      expect(readMock).toHaveBeenCalledWith('/tmp/scan.1.jpg')
      expect(readMock).toHaveBeenCalledWith('/tmp/scan.2.jpg')
      expect(addAnswerKey).toHaveBeenCalledTimes(2)
      expect(addAnswerKey).toHaveBeenCalledWith(expect.objectContaining({ title: '수학 시험' }))
      expect(addAnswerKey).toHaveBeenCalledWith(expect.objectContaining({ title: '영어 시험' }))
      expect(cleanupMock).toHaveBeenCalledTimes(2)
    })
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('ADF에 3장 → 정답지 3개 등록', async () => {
    setupMultiPageScan(3)
    const mockStructure = { title: 'Test', answers: {}, totalQuestions: 0 }
    vi.mocked(extractAnswerStructure).mockResolvedValue(mockStructure)

    const addAnswerKey = vi.fn()
    useScanStore.setState({ addAnswerKey })

    render(<AnswerKeyManagement />)
    fireEvent.click(screen.getByRole('button', { name: /스캐너로 스캔/ }))

    await waitFor(() => {
      expect(addAnswerKey).toHaveBeenCalledTimes(3)
    })
  })

  it('문서 없음 에러 → alert 표시', async () => {
    window.electronAPI = {
      ...window.electronAPI!,
      scanner: {
        ...window.electronAPI!.scanner,
        scan: vi.fn().mockRejectedValue(new Error('Scan completed but output file not found')),
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

  it('duplex 설정 시 source: duplex로 스캔 호출', async () => {
    const { scanMock } = setupSinglePageScan()
    const mockStructure = { title: 'Test', answers: {}, totalQuestions: 0 }
    vi.mocked(extractAnswerStructure).mockResolvedValue(mockStructure)
    useScanStore.setState({
      addAnswerKey: vi.fn(),
      scanSettings: { source: 'duplex', dpi: 300 },
    })

    render(<AnswerKeyManagement />)
    fireEvent.click(screen.getByRole('button', { name: /스캐너로 스캔/ }))

    await waitFor(() => {
      expect(scanMock).toHaveBeenCalledWith(expect.objectContaining({ source: 'duplex' }))
    })
  })

  it('스캔 중 로딩 표시 → 완료 후 제거', async () => {
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
    resolveScan!({ filePath: '/tmp/scan.jpg', mimeType: 'image/jpeg' })

    // Loading indicator should disappear
    await waitFor(() => {
      expect(screen.queryByText('스캐너 스캔 중...')).not.toBeInTheDocument()
    })
  })
})
