import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBatchScan } from '../use-batch-scan'

// ─── Hoisted mocks (available in vi.mock factories) ───────────────────────────

const { mockAddScannedPage, mockBase64ToFile, mockScanSettings } = vi.hoisted(() => ({
  mockAddScannedPage: vi.fn(),
  mockBase64ToFile: vi.fn(),
  mockScanSettings: { source: 'feeder' as 'glass' | 'feeder' | 'duplex' },
}))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/store/use-scan-store', () => {
  const store = Object.assign(
    () => ({ addScannedPage: mockAddScannedPage }),
    { getState: () => ({ scanSettings: mockScanSettings }) },
  )
  return { useScanStore: store }
})

vi.mock('@/lib/scan-utils', () => ({
  base64ToFile: mockBase64ToFile,
}))

vi.mock('uuid', () => ({
  v4: () => 'test-uuid',
}))

// ─── Scanner API mocks ────────────────────────────────────────────────────────

const mockScan = vi.fn()
const mockReadScanFile = vi.fn()
const mockCleanupScanFile = vi.fn()

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  Object.defineProperty(window, 'electronAPI', {
    value: {
      scanner: {
        scan: mockScan,
        readScanFile: mockReadScanFile,
        cleanupScanFile: mockCleanupScanFile,
      },
    },
    writable: true,
    configurable: true,
  })

  // Default: base64ToFile returns a File
  mockBase64ToFile.mockImplementation(
    (base64: string, name: string, mime: string) => new File([base64], name, { type: mime }),
  )

  // Reset scan settings to default
  mockScanSettings.source = 'feeder'

  // Default: readScanFile returns a base64 string
  mockReadScanFile.mockResolvedValue('base64data')

  // Default: cleanupScanFile resolves
  mockCleanupScanFile.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Configures mockScan to return N pages then throw 'no-more-pages'.
 */
function setupNPages(n: number) {
  let callCount = 0
  mockScan.mockImplementation(async () => {
    callCount++
    if (callCount > n) throw new Error('no-more-pages')
    return { filePath: `/tmp/scan-${callCount}.jpg`, mimeType: 'image/jpeg' }
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useBatchScan', () => {
  // ── 정상 스캔 플로우 ──────────────────────────────────────────────────────

  describe('정상 스캔 플로우', () => {
    it('startScan 호출 → isScanning이 true가 됨', async () => {
      // Scan never resolves so we can catch the in-progress state
      let resolvePage: (value: { filePath: string; mimeType: string }) => void
      mockScan.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePage = resolve
          }),
      )

      const { result } = renderHook(() => useBatchScan())

      act(() => {
        void result.current.startScan()
      })

      await waitFor(() => {
        expect(result.current.isScanning).toBe(true)
      })

      // Unblock the pending scan so the hook can finish cleanly
      act(() => {
        resolvePage!({ filePath: '/tmp/scan-1.jpg', mimeType: 'image/jpeg' })
      })
      mockScan.mockRejectedValueOnce(new Error('no-more-pages'))

      await waitFor(() => {
        expect(result.current.isScanning).toBe(false)
      })
    })

    it('scan → readScanFile → addScannedPage 순서로 호출됨', async () => {
      setupNPages(1)

      const { result } = renderHook(() => useBatchScan())
      await act(async () => {
        await result.current.startScan()
      })

      // 1 successful scan + 1 no-more-pages throw
      expect(mockScan).toHaveBeenCalledTimes(2)
      expect(mockReadScanFile).toHaveBeenCalledWith('/tmp/scan-1.jpg')
      expect(mockAddScannedPage).toHaveBeenCalledTimes(1)

      // Verify call order via invocationCallOrder
      const scanOrder = mockScan.mock.invocationCallOrder[0]
      const readOrder = mockReadScanFile.mock.invocationCallOrder[0]
      const addOrder = mockAddScannedPage.mock.invocationCallOrder[0]
      expect(scanOrder).toBeLessThan(readOrder)
      expect(readOrder).toBeLessThan(addOrder)
    })

    it("'no-more-pages' 에러 → isScanning false (정상 종료)", async () => {
      setupNPages(0) // Immediately throw no-more-pages

      const { result } = renderHook(() => useBatchScan())
      await act(async () => {
        await result.current.startScan()
      })

      expect(result.current.isScanning).toBe(false)
      expect(result.current.lastError).toBeNull()
    })

    it('종료 후 pageCount가 스캔된 총 페이지 수와 일치', async () => {
      setupNPages(3)

      const { result } = renderHook(() => useBatchScan())
      await act(async () => {
        await result.current.startScan()
      })

      expect(result.current.pageCount).toBe(3)
      expect(mockAddScannedPage).toHaveBeenCalledTimes(3)
    })

    it('addScannedPage에 uuid와 File이 담긴 객체가 전달됨', async () => {
      setupNPages(1)
      const fakeFile = new File([''], 'scan-0.jpeg', { type: 'image/jpeg' })
      mockBase64ToFile.mockReturnValue(fakeFile)

      const { result } = renderHook(() => useBatchScan())
      await act(async () => {
        await result.current.startScan()
      })

      expect(mockAddScannedPage).toHaveBeenCalledWith({
        id: 'test-uuid',
        file: fakeFile,
        files: [fakeFile],
      })
    })

    it('cleanupScanFile이 각 페이지마다 filePath와 함께 호출됨', async () => {
      setupNPages(2)

      const { result } = renderHook(() => useBatchScan())
      await act(async () => {
        await result.current.startScan()
      })

      expect(mockCleanupScanFile).toHaveBeenCalledTimes(2)
      expect(mockCleanupScanFile).toHaveBeenCalledWith('/tmp/scan-1.jpg')
      expect(mockCleanupScanFile).toHaveBeenCalledWith('/tmp/scan-2.jpg')
    })
  })

  // ── 에러 처리 ────────────────────────────────────────────────────────────

  describe('에러 처리', () => {
    it('용지 걸림 에러 → lastError 설정 + onJam 콜백 호출', async () => {
      mockScan.mockRejectedValueOnce(new Error('paper jam detected'))

      const onJam = vi.fn().mockResolvedValue('stop')
      const { result } = renderHook(() => useBatchScan())

      await act(async () => {
        await result.current.startScan({ onJam })
      })

      expect(result.current.lastError).toBe('paper jam detected')
      expect(onJam).toHaveBeenCalledTimes(1)
    })

    it("'jam' 키워드 에러 → onJam 콜백 호출됨", async () => {
      mockScan.mockRejectedValueOnce(new Error('jam'))

      const onJam = vi.fn().mockResolvedValue('stop')
      const { result } = renderHook(() => useBatchScan())

      await act(async () => {
        await result.current.startScan({ onJam })
      })

      expect(onJam).toHaveBeenCalledTimes(1)
    })

    it("onJam 콜백에서 'continue' 반환 → 스캔 재개", async () => {
      let jamTriggered = false
      mockScan.mockImplementation(async () => {
        if (!jamTriggered) {
          jamTriggered = true
          throw new Error('jam')
        }
        throw new Error('no-more-pages')
      })

      const onJam = vi.fn().mockResolvedValue('continue')
      const { result } = renderHook(() => useBatchScan())

      await act(async () => {
        await result.current.startScan({ onJam })
      })

      // After 'continue', scan resumes and hits no-more-pages → normal exit
      expect(result.current.isScanning).toBe(false)
      expect(result.current.lastError).toBe('jam') // lastError is set even on continue
      expect(onJam).toHaveBeenCalledTimes(1)
      // scan called twice: once jam, once no-more-pages
      expect(mockScan).toHaveBeenCalledTimes(2)
    })

    it("onJam 콜백에서 'stop' 반환 → isScanning false로 종료", async () => {
      mockScan.mockRejectedValueOnce(new Error('jam'))

      const onJam = vi.fn().mockResolvedValue('stop')
      const { result } = renderHook(() => useBatchScan())

      await act(async () => {
        await result.current.startScan({ onJam })
      })

      expect(result.current.isScanning).toBe(false)
    })

    it('onJam 없이 jam 에러 → 스캔 중단', async () => {
      mockScan.mockRejectedValueOnce(new Error('jam'))

      const { result } = renderHook(() => useBatchScan())

      await act(async () => {
        await result.current.startScan()
      })

      expect(result.current.isScanning).toBe(false)
      expect(result.current.lastError).toBe('jam')
    })

    it('NAPS2 피더 빈 용지 메시지 → 정상 종료 (no documents)', async () => {
      setupNPages(2)
      // 3번째 호출: NAPS2 stdout으로 전파된 피더 빈 용지 메시지
      mockScan
        .mockResolvedValueOnce({ filePath: '/tmp/scan-1.jpg', mimeType: 'image/jpeg' })
        .mockResolvedValueOnce({ filePath: '/tmp/scan-2.jpg', mimeType: 'image/jpeg' })
        .mockRejectedValueOnce(new Error('Scan failed: No documents in feeder'))

      const { result } = renderHook(() => useBatchScan())
      await act(async () => {
        await result.current.startScan()
      })

      expect(result.current.isScanning).toBe(false)
      expect(result.current.lastError).toBeNull()
      expect(result.current.pageCount).toBe(2)
    })

    it('NAPS2 피더 빈 용지 메시지 → 정상 종료 (feeder empty)', async () => {
      mockScan
        .mockResolvedValueOnce({ filePath: '/tmp/scan-1.jpg', mimeType: 'image/jpeg' })
        .mockRejectedValueOnce(new Error('Scan failed: feeder empty'))

      const { result } = renderHook(() => useBatchScan())
      await act(async () => {
        await result.current.startScan()
      })

      expect(result.current.isScanning).toBe(false)
      expect(result.current.lastError).toBeNull()
    })

    it('ADF 피더에서 1장 이상 스캔 후 Command failed → 용지 소진으로 정상 종료', async () => {
      mockScan
        .mockResolvedValueOnce({ filePath: '/tmp/scan-1.jpg', mimeType: 'image/jpeg' })
        .mockRejectedValueOnce(
          new Error("Error invoking remote method 'scanner:scan': Error: Scan failed: Command failed: NAPS2.Console.exe ..."),
        )

      const { result } = renderHook(() => useBatchScan())
      await act(async () => {
        await result.current.startScan()
      })

      expect(result.current.isScanning).toBe(false)
      expect(result.current.lastError).toBeNull()
      expect(result.current.pageCount).toBe(1)
    })

    it('ADF 피더에서 0장 스캔 시 Command failed → 에러로 처리', async () => {
      mockScan.mockRejectedValueOnce(
        new Error("Error invoking remote method 'scanner:scan': Error: Scan failed: Command failed: NAPS2.Console.exe ..."),
      )

      const { result } = renderHook(() => useBatchScan())
      await act(async () => {
        await result.current.startScan()
      })

      expect(result.current.isScanning).toBe(false)
      expect(result.current.lastError).not.toBeNull()
    })

    it('알 수 없는 에러 → lastError 설정 + 스캔 중단', async () => {
      mockScan.mockRejectedValueOnce(new Error('unexpected hardware failure'))

      const { result } = renderHook(() => useBatchScan())

      await act(async () => {
        await result.current.startScan()
      })

      expect(result.current.lastError).toBe('unexpected hardware failure')
      expect(result.current.isScanning).toBe(false)
    })

    it('알 수 없는 에러 후 추가 scan 호출 없음', async () => {
      mockScan.mockRejectedValueOnce(new Error('unknown error'))

      const { result } = renderHook(() => useBatchScan())

      await act(async () => {
        await result.current.startScan()
      })

      expect(mockScan).toHaveBeenCalledTimes(1)
    })

    it('startScan 재호출 시 lastError 초기화됨', async () => {
      // First scan: unknown error
      mockScan.mockRejectedValueOnce(new Error('some error'))
      const { result } = renderHook(() => useBatchScan())

      await act(async () => {
        await result.current.startScan()
      })
      expect(result.current.lastError).toBe('some error')

      // Second scan: clean exit
      mockScan.mockRejectedValueOnce(new Error('no-more-pages'))
      await act(async () => {
        await result.current.startScan()
      })
      expect(result.current.lastError).toBeNull()
    })

    it('non-Error 객체 throw → lastError에 String 변환값 설정', async () => {
      mockScan.mockRejectedValueOnce('string error value')

      const { result } = renderHook(() => useBatchScan())

      await act(async () => {
        await result.current.startScan()
      })

      expect(result.current.lastError).toBe('string error value')
      expect(result.current.isScanning).toBe(false)
    })
  })

  // ── stopScan ─────────────────────────────────────────────────────────────

  describe('stopScan', () => {
    it('스캔 중 stopScan 호출 → 루프 중단 후 isScanning false', async () => {
      let callCount = 0
      mockScan.mockImplementation(async () => {
        callCount++
        // yield to event loop so stopScan can set the flag
        await new Promise((r) => setTimeout(r, 0))
        return { filePath: `/tmp/scan-${callCount}.jpg`, mimeType: 'image/jpeg' }
      })

      const { result } = renderHook(() => useBatchScan())

      let scanDone = false
      act(() => {
        void result.current.startScan().then(() => {
          scanDone = true
        })
      })

      await waitFor(() => expect(result.current.isScanning).toBe(true))

      act(() => {
        result.current.stopScan()
      })

      await waitFor(() => expect(result.current.isScanning).toBe(false))
      expect(scanDone).toBe(true)
    })

    it('stopScan 후 새 startScan 호출 → 정상 동작', async () => {
      // First scan: yields to allow stop
      mockScan.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 0))
        return { filePath: '/tmp/scan-1.jpg', mimeType: 'image/jpeg' }
      })

      const { result } = renderHook(() => useBatchScan())

      act(() => {
        void result.current.startScan()
      })
      await waitFor(() => expect(result.current.isScanning).toBe(true))

      act(() => {
        result.current.stopScan()
      })
      await waitFor(() => expect(result.current.isScanning).toBe(false))

      // Second scan: 1 page then done
      mockScan.mockReset()
      setupNPages(1)

      await act(async () => {
        await result.current.startScan()
      })

      expect(result.current.isScanning).toBe(false)
      expect(result.current.pageCount).toBe(1)
    })

    it('cleanupScanFile은 정상 완료된 페이지에 대해 호출됨', async () => {
      setupNPages(2)

      const { result } = renderHook(() => useBatchScan())
      await act(async () => {
        await result.current.startScan()
      })

      expect(mockCleanupScanFile).toHaveBeenCalledTimes(2)
    })
  })

  // ── scanOptions 전달 ──────────────────────────────────────────────────────

  describe('scanOptions', () => {
    it('기본 scanOptions (format: jpeg, source: feeder) 적용됨', async () => {
      setupNPages(1)

      const { result } = renderHook(() => useBatchScan())
      await act(async () => {
        await result.current.startScan()
      })

      expect(mockScan).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'jpeg', source: 'feeder' }),
      )
    })

    it('커스텀 scanOptions → 기본값 오버라이드', async () => {
      setupNPages(1)

      const { result } = renderHook(() => useBatchScan())
      await act(async () => {
        await result.current.startScan({ scanOptions: { format: 'png', source: 'glass' } })
      })

      expect(mockScan).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'png', source: 'glass' }),
      )
    })
  })

  // ── Duplex 그룹핑 ──────────────────────────────────────────────────────────

  describe('duplex 양면스캔 그룹핑', () => {
    it('duplex 스캔 시 2페이지가 하나의 ScannedPage로 묶임', async () => {
      // ADF duplex: 1회 scan 호출에 filePath + additionalFiles[0] 반환
      let callCount = 0
      mockScan.mockImplementation(async () => {
        callCount++
        if (callCount > 1) throw new Error('no-more-pages')
        return {
          filePath: '/tmp/scan-front.jpg',
          mimeType: 'image/jpeg',
          additionalFiles: ['/tmp/scan-back.jpg'],
        }
      })

      const frontFile = new File(['front'], 'scan-0.jpeg', { type: 'image/jpeg' })
      const backFile = new File(['back'], 'scan-1.jpeg', { type: 'image/jpeg' })
      mockBase64ToFile
        .mockReturnValueOnce(frontFile)
        .mockReturnValueOnce(backFile)

      const { result } = renderHook(() => useBatchScan())
      await act(async () => {
        await result.current.startScan({ scanOptions: { source: 'duplex' } })
      })

      // 2페이지가 1개의 ScannedPage로 묶여야 함
      expect(mockAddScannedPage).toHaveBeenCalledTimes(1)
      expect(mockAddScannedPage).toHaveBeenCalledWith(
        expect.objectContaining({
          file: frontFile,
          files: [frontFile, backFile],
        }),
      )
      expect(result.current.pageCount).toBe(2)
    })

    it('feeder 스캔 시 additionalFiles가 있어도 각각 별도 ScannedPage로 등록', async () => {
      let callCount = 0
      mockScan.mockImplementation(async () => {
        callCount++
        if (callCount > 1) throw new Error('no-more-pages')
        return {
          filePath: '/tmp/scan-1.jpg',
          mimeType: 'image/jpeg',
          additionalFiles: ['/tmp/scan-2.jpg'],
        }
      })

      const file1 = new File(['p1'], 'scan-0.jpeg', { type: 'image/jpeg' })
      const file2 = new File(['p2'], 'scan-1.jpeg', { type: 'image/jpeg' })
      mockBase64ToFile
        .mockReturnValueOnce(file1)
        .mockReturnValueOnce(file2)

      const { result } = renderHook(() => useBatchScan())
      await act(async () => {
        await result.current.startScan({ scanOptions: { source: 'feeder' } })
      })

      // feeder이므로 각각 별도 ScannedPage
      expect(mockAddScannedPage).toHaveBeenCalledTimes(2)
      expect(mockAddScannedPage).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ file: file1, files: [file1] }),
      )
      expect(mockAddScannedPage).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ file: file2, files: [file2] }),
      )
    })

    it('addFiles: duplex 설정이면 2개씩 묶음', () => {
      mockScanSettings.source = 'duplex'
      const files = [
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
        new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
        new File(['d'], 'd.jpg', { type: 'image/jpeg' }),
      ]

      const { result } = renderHook(() => useBatchScan())
      act(() => {
        result.current.addFiles(files)
      })

      // 4파일 → duplex → 2개의 ScannedPage
      expect(mockAddScannedPage).toHaveBeenCalledTimes(2)
      expect(mockAddScannedPage).toHaveBeenNthCalledWith(1,
        expect.objectContaining({ file: files[0], files: [files[0], files[1]] }),
      )
      expect(mockAddScannedPage).toHaveBeenNthCalledWith(2,
        expect.objectContaining({ file: files[2], files: [files[2], files[3]] }),
      )
    })

    it('addFiles: feeder 설정이면 각각 별도', () => {
      mockScanSettings.source = 'feeder'
      const files = [
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
      ]

      const { result } = renderHook(() => useBatchScan())
      act(() => {
        result.current.addFiles(files)
      })

      expect(mockAddScannedPage).toHaveBeenCalledTimes(2)
    })
  })
})
