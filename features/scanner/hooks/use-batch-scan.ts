"use client"

import { useState, useCallback, useRef } from 'react'
import { useScanStore } from '@/store/use-scan-store'
import { useScannerStore } from '@/store/use-scanner-store'
import { base64ToFile } from '@/lib/scan-utils'
import { v4 as uuidv4 } from 'uuid'
import type { ScanOptions } from '@/types'

type JamAction = 'continue' | 'stop'
type JamCallback = () => Promise<JamAction>

interface UseBatchScanOptions {
  scanOptions?: ScanOptions
  onJam?: JamCallback
}

interface UseBatchScanReturn {
  isScanning: boolean
  pageCount: number
  lastError: string | null
  startScan: (options?: UseBatchScanOptions) => Promise<void>
  stopScan: () => void
  /** Dev 모드 전용: 파일을 직접 추가 (스캔 대체) */
  addFiles: (files: File[]) => void
  /** USB 스캐너: IPC로 가져온 파일을 스캔 결과로 추가 */
  importFromFolder: () => Promise<number>
  importFromDrive: (driveLetter: string) => Promise<number>
  isDevMode: boolean
}

const isDevMode =
  process.env.NODE_ENV === 'development' &&
  (typeof window === 'undefined' || !window.electronAPI?.isElectron)

export function useBatchScan(): UseBatchScanReturn {
  const [isScanning, setIsScanning] = useState(false)
  const [pageCount, setPageCount] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const shouldStopRef = useRef(false)
  const { addScannedPage } = useScanStore()

  /** Dev 모드 전용: 파일 업로드로 스캔 대체 */
  const addFiles = useCallback(
    (files: File[]) => {
      setLastError(null)
      const source = useScanStore.getState().scanSettings.source
      const groupSize = source === 'duplex' ? 2 : 1
      let count = pageCount
      for (let i = 0; i < files.length; i += groupSize) {
        const groupFiles = files.slice(i, i + groupSize)
        addScannedPage({ id: uuidv4(), file: groupFiles[0], files: groupFiles })
        count += groupFiles.length
      }
      setPageCount(count)
    },
    [addScannedPage, pageCount],
  )

  const startScan = useCallback(async (options?: UseBatchScanOptions) => {
    const { scanOptions, onJam } = options ?? {}

    const mergedScanOptions: ScanOptions = {
      format: 'jpeg',
      source: 'feeder',
      ...scanOptions,
    }

    console.log('[Scanner UI] startScan: 시작, 옵션:', JSON.stringify(mergedScanOptions))

    shouldStopRef.current = false
    setIsScanning(true)
    setLastError(null)
    setPageCount(0)

    let currentPageCount = 0

    while (!shouldStopRef.current) {
      try {
        console.log('[Scanner UI] startScan: 페이지', currentPageCount + 1, '스캔 시작')
        const { filePath, mimeType, additionalFiles } = await window.electronAPI!.scanner.scan(mergedScanOptions)
        console.log('[Scanner UI] startScan: 스캔 완료, filePath:', filePath, ', additionalFiles:', additionalFiles?.length ?? 0)

        // 모든 출력 파일(기본 + 추가)을 File 객체로 변환
        const allFilePaths = [filePath, ...(additionalFiles ?? [])]
        const scannedFiles: File[] = []
        for (const scanFilePath of allFilePaths) {
          const base64 = await window.electronAPI!.scanner.readScanFile(scanFilePath)
          const ext = mimeType.split('/')[1] ?? 'jpeg'
          const file = base64ToFile(base64, `scan-${currentPageCount + scannedFiles.length}.${ext}`, mimeType)
          await window.electronAPI!.scanner.cleanupScanFile(scanFilePath)
          scannedFiles.push(file)
        }

        // Duplex: 2페이지씩 묶어서 하나의 ScannedPage로 등록
        const groupSize = mergedScanOptions.source === 'duplex' ? 2 : 1
        for (let i = 0; i < scannedFiles.length; i += groupSize) {
          const groupFiles = scannedFiles.slice(i, i + groupSize)
          addScannedPage({ id: uuidv4(), file: groupFiles[0], files: groupFiles })
        }

        currentPageCount += scannedFiles.length
        setPageCount(currentPageCount)
        console.log('[Scanner UI] startScan: 페이지', currentPageCount, '완료')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const lowerMessage = message.toLowerCase()
        console.error('[Scanner UI] startScan: 에러 발생:', message)

        const noMorePagesPatterns = [
          'no-more-pages', 'no more pages', 'no documents', 'feeder empty',
          'out of paper', 'feeder is empty', 'no paper', 'adf empty',
          'nomedia', 'no scanned pages',
        ]
        const isNoMorePages = noMorePagesPatterns.some(p => lowerMessage.includes(p))
        // ADF 피더에서 1장 이상 스캔 후 일반 실패 → 용지 소진으로 간주
        const isFeederExhausted = (mergedScanOptions.source === 'feeder' || mergedScanOptions.source === 'duplex')
          && currentPageCount > 0
          && lowerMessage.includes('command failed')

        if (isNoMorePages || isFeederExhausted) {
          console.log('[Scanner UI] startScan: ADF 종료', isFeederExhausted ? '(용지 소진 추정)' : '(no-more-pages)')
          break
        } else if (lowerMessage.includes('jam') || lowerMessage.includes('paper jam')) {
          console.warn('[Scanner UI] startScan: 용지 걸림')
          setLastError(message)
          if (onJam) {
            const action = await onJam()
            if (action === 'continue') {
              continue
            } else {
              break
            }
          } else {
            break
          }
        } else {
          const occupiedKeywords = ['in use', 'busy', 'locked', 'exclusive', 'denied']
          if (occupiedKeywords.some(kw => lowerMessage.includes(kw))) {
            console.warn('[Scanner UI] startScan: 스캐너 점유 중')
            setLastError('다른 프로그램이 스캐너를 사용 중입니다. 해당 프로그램을 종료한 후 다시 시도해 주세요.')
          } else {
            console.error('[Scanner UI] startScan: 알 수 없는 에러:', message)
            setLastError(message)
            // 스캐너 연결 해제 가능성 → 상태 갱신
            useScannerStore.getState().refreshDevices()
          }
          break
        }
      }
    }

    console.log('[Scanner UI] startScan: 종료, 총 페이지:', currentPageCount)
    setIsScanning(false)
  }, [addScannedPage])

  const stopScan = useCallback(() => {
    shouldStopRef.current = true
  }, [])

  /** USB 스캐너: IPC 결과를 스캔 페이지로 변환하는 공통 헬퍼 */
  const processImportResult = useCallback(async (
    importFn: () => Promise<{ files: Array<{ filePath: string; mimeType: string }> }>
  ): Promise<number> => {
    setLastError(null)
    try {
      const result = await importFn()
      const importedEntries = result.files ?? []
      const source = useScanStore.getState().scanSettings.source
      const groupSize = source === 'duplex' ? 2 : 1
      let count = pageCount

      // 먼저 모든 파일을 File 객체로 변환
      const allFiles: File[] = []
      for (const { filePath, mimeType } of importedEntries) {
        const base64 = await window.electronAPI!.scanner.readScanFile(filePath)
        const ext = mimeType.split('/')[1] ?? 'jpeg'
        const file = base64ToFile(base64, `import-${count + allFiles.length}.${ext}`, mimeType)
        await window.electronAPI!.scanner.cleanupScanFile(filePath)
        allFiles.push(file)
      }

      // Duplex: 2개씩 묶어서 ScannedPage로 등록
      for (let i = 0; i < allFiles.length; i += groupSize) {
        const groupFiles = allFiles.slice(i, i + groupSize)
        addScannedPage({ id: uuidv4(), file: groupFiles[0], files: groupFiles })
      }
      count += allFiles.length
      setPageCount(count)
      return allFiles.length
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setLastError(message)
      return 0
    }
  }, [addScannedPage, pageCount])

  const importFromFolder = useCallback(async (): Promise<number> => {
    return processImportResult(() => window.electronAPI!.scanner.importFromFolder())
  }, [processImportResult])

  const importFromDrive = useCallback(async (driveLetter: string): Promise<number> => {
    return processImportResult(() => window.electronAPI!.scanner.importFromDrive(driveLetter))
  }, [processImportResult])

  return {
    isScanning,
    pageCount,
    lastError,
    startScan,
    stopScan,
    addFiles,
    importFromFolder,
    importFromDrive,
    isDevMode,
  }
}
