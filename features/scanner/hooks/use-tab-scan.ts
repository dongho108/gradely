"use client"

import { useState, useCallback, useRef } from 'react'
import { useTabStore } from '@/store/use-tab-store'
import { useAuthStore } from '@/store/use-auth-store'
import { uploadAndTrackSubmission } from '@/lib/auto-save'
import { base64ToFile } from '@/lib/scan-utils'
import type { ScanOptions } from '@/types'

interface UseTabScanOptions {
  scanOptions?: ScanOptions
}

interface UseTabScanReturn {
  isScanning: boolean
  pageCount: number
  lastError: string | null
  startScan: (options?: UseTabScanOptions) => Promise<void>
  stopScan: () => void
}

/**
 * Per-tab scanning hook that adds scanned pages directly as submissions
 * to the specified tab, triggering the auto-grading queue.
 */
export function useTabScan(tabId: string): UseTabScanReturn {
  const [isScanning, setIsScanning] = useState(false)
  const [pageCount, setPageCount] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const shouldStopRef = useRef(false)

  const startScan = useCallback(async (options?: UseTabScanOptions) => {
    const { scanOptions } = options ?? {}

    const mergedScanOptions: ScanOptions = {
      format: 'jpeg',
      source: 'feeder',
      ...scanOptions,
    }

    shouldStopRef.current = false
    setIsScanning(true)
    setLastError(null)
    setPageCount(0)

    let currentPageCount = 0

    while (!shouldStopRef.current) {
      try {
        const { filePath, mimeType, additionalFiles } = await window.electronAPI!.scanner.scan(mergedScanOptions)

        // 모든 출력 파일(기본 + ADF 추가 페이지)을 File 객체로 변환
        const allFilePaths = [filePath, ...(additionalFiles ?? [])]
        const scannedFiles: File[] = []
        for (const scanFilePath of allFilePaths) {
          const base64 = await window.electronAPI!.scanner.readScanFile(scanFilePath)
          const ext = mimeType.split('/')[1] ?? 'jpeg'
          const file = base64ToFile(base64, `student-scan-${currentPageCount + scannedFiles.length}.${ext}`, mimeType)
          await window.electronAPI!.scanner.cleanupScanFile(scanFilePath)
          scannedFiles.push(file)
        }

        // Duplex: 2페이지씩 묶어서 하나의 submission으로 등록
        const groupSize = mergedScanOptions.source === 'duplex' ? 2 : 1
        const userId = useAuthStore.getState().user?.id
        for (let i = 0; i < scannedFiles.length; i += groupSize) {
          const groupFiles = scannedFiles.slice(i, i + groupSize)
          const submissionId = Math.random().toString(36).substring(2, 9)
          useTabStore.getState().addSubmission(tabId, groupFiles, submissionId)
          useTabStore.getState().setSubmissionStatus(tabId, submissionId, 'queued')
          // 오류 제보 첨부용으로 Storage 업로드 (duplex 시 앞면만)
          if (userId) {
            uploadAndTrackSubmission(userId, tabId, submissionId, groupFiles[0])
          }
        }

        currentPageCount += scannedFiles.length
        setPageCount(currentPageCount)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const lowerMessage = message.toLowerCase()

        const noMorePagesPatterns = [
          'no-more-pages', 'no more pages', 'no documents', 'feeder empty',
          'out of paper', 'feeder is empty', 'no paper', 'adf empty',
          'nomedia', 'no scanned pages',
        ]
        const isNoMorePages = noMorePagesPatterns.some(p => lowerMessage.includes(p))
        const isFeederExhausted = (mergedScanOptions.source === 'feeder' || mergedScanOptions.source === 'duplex')
          && currentPageCount > 0
          && lowerMessage.includes('command failed')

        if (isNoMorePages || isFeederExhausted) {
          break
        } else {
          const occupiedKeywords = ['in use', 'busy', 'locked', 'exclusive', 'denied']
          if (occupiedKeywords.some(kw => lowerMessage.includes(kw))) {
            setLastError('다른 프로그램이 스캐너를 사용 중입니다. 해당 프로그램을 종료한 후 다시 시도해 주세요.')
          } else {
            setLastError(message)
          }
          break
        }
      }
    }

    setIsScanning(false)
  }, [tabId])

  const stopScan = useCallback(() => {
    shouldStopRef.current = true
  }, [])

  return {
    isScanning,
    pageCount,
    lastError,
    startScan,
    stopScan,
  }
}
