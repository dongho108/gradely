"use client"

import { useState, useCallback, useRef } from 'react'
import { useScanStore, type ScanSettings } from '@/store/use-scan-store'
import { useTabStore } from '@/store/use-tab-store'
import { useScannerAvailability } from '@/features/scanner/hooks/use-scanner-availability'
import { base64ToFile } from '@/lib/scan-utils'
import { extractAnswerStructureFromImages } from '@/lib/grading-service'
import { filesToImages } from '@/lib/file-utils'
import { Button } from '@/components/ui/button'
import { ScanLine, Loader2, Check, X, Plus, Upload, Scissors, Eye } from 'lucide-react'
import { AnswerKeyImagePreview } from './answer-key-image-preview'
import { v4 as uuidv4 } from 'uuid'
import { cn } from '@/lib/utils'
import type { ScanOptions } from '@/types'
import type { AnswerKeyStructure } from '@/types/grading'

interface AnswerKeyGroup {
  id: string
  pages: { id: string; file: File; label: string }[]
  status: 'pending' | 'analyzing' | 'ready' | 'error'
  title?: string
  questionCount?: number
  structure?: AnswerKeyStructure
  error?: string
}

export function AnswerKeyScanPanel() {
  const { scanSettings, updateScanSettings } = useScanStore()
  const { addTabFromAnswerKey } = useTabStore()
  const { devices } = useScannerAvailability()

  const [groups, setGroups] = useState<AnswerKeyGroup[]>([])
  const [previewGroup, setPreviewGroup] = useState<AnswerKeyGroup | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanPageCount, setScanPageCount] = useState(0)
  const shouldStopRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isDevMode = process.env.NODE_ENV === 'development'
    && (typeof window === 'undefined' || !window.electronAPI?.isElectron)

  // Group pages based on source setting
  const createGroups = useCallback((files: File[], source: ScanSettings['source']) => {
    const newGroups: AnswerKeyGroup[] = []

    if (source === 'duplex') {
      // Duplex: every 2 pages = 1 answer key
      for (let i = 0; i < files.length; i += 2) {
        const pages = [{ id: uuidv4(), file: files[i], label: `페이지 ${i + 1} (앞면)` }]
        if (i + 1 < files.length) {
          pages.push({ id: uuidv4(), file: files[i + 1], label: `페이지 ${i + 2} (뒷면)` })
        }
        newGroups.push({ id: uuidv4(), pages, status: 'pending' })
      }
    } else {
      // Feeder/Glass: each page = 1 answer key
      for (let i = 0; i < files.length; i++) {
        newGroups.push({
          id: uuidv4(),
          pages: [{ id: uuidv4(), file: files[i], label: `페이지 ${i + 1}` }],
          status: 'pending',
        })
      }
    }

    return newGroups
  }, [])

  // Analyze a group with AI
  const analyzeGroup = useCallback(async (group: AnswerKeyGroup) => {
    setGroups(prev => prev.map(g => g.id === group.id ? { ...g, status: 'analyzing' } : g))

    try {
      const allImages = await filesToImages(group.pages.map(p => p.file))
      const structure = await extractAnswerStructureFromImages(allImages)

      setGroups(prev => prev.map(g =>
        g.id === group.id
          ? {
              ...g,
              status: 'ready',
              title: structure.title || `정답지 ${prev.indexOf(g) + 1}`,
              questionCount: structure.totalQuestions ?? 0,
              structure,
            }
          : g
      ))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setGroups(prev => prev.map(g =>
        g.id === group.id ? { ...g, status: 'error', error: message } : g
      ))
    }
  }, [])

  // Start scanning via NAPS2
  const startScan = useCallback(async () => {
    const scanOptions: ScanOptions = {
      format: 'jpeg',
      source: scanSettings.source,
    }

    shouldStopRef.current = false
    setIsScanning(true)
    setScanPageCount(0)

    const scannedFiles: File[] = []

    while (!shouldStopRef.current) {
      try {
        const { filePath, mimeType, additionalFiles } = await window.electronAPI!.scanner.scan(scanOptions)

        // 모든 출력 파일(기본 + ADF 추가 페이지) 처리
        const allFiles = [filePath, ...(additionalFiles ?? [])]
        for (const scanFilePath of allFiles) {
          const base64 = await window.electronAPI!.scanner.readScanFile(scanFilePath)
          const ext = mimeType.split('/')[1] ?? 'jpeg'
          const file = base64ToFile(base64, `answer-key-scan-${scannedFiles.length}.${ext}`, mimeType)
          await window.electronAPI!.scanner.cleanupScanFile(scanFilePath)

          scannedFiles.push(file)
          setScanPageCount(scannedFiles.length)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const lowerMessage = message.toLowerCase()

        const noMorePagesPatterns = [
          'no-more-pages', 'no more pages', 'no documents', 'feeder empty',
          'out of paper', 'feeder is empty', 'no paper', 'adf empty',
          'nomedia', 'no scanned pages',
        ]
        const isNoMorePages = noMorePagesPatterns.some(p => lowerMessage.includes(p))
        const isFeederExhausted = scanOptions.source === 'feeder'
          && scannedFiles.length > 0
          && lowerMessage.includes('command failed')

        if (isNoMorePages || isFeederExhausted) {
          break
        } else {
          break
        }
      }
    }

    setIsScanning(false)

    if (scannedFiles.length > 0) {
      const newGroups = createGroups(scannedFiles, scanSettings.source)
      setGroups(prev => [...prev, ...newGroups])

      // Start analyzing all new groups
      for (const group of newGroups) {
        analyzeGroup(group)
      }
    }
  }, [scanSettings, createGroups, analyzeGroup])

  // Dev mode: add files manually
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const fileArray = Array.from(files)
    const newGroups = createGroups(fileArray, scanSettings.source)
    setGroups(prev => [...prev, ...newGroups])

    for (const group of newGroups) {
      analyzeGroup(group)
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [scanSettings.source, createGroups, analyzeGroup])

  // Split a group into individual pages
  const splitGroup = useCallback((groupId: string) => {
    setGroups(prev => {
      const idx = prev.findIndex(g => g.id === groupId)
      if (idx === -1) return prev

      const group = prev[idx]
      if (group.pages.length <= 1) return prev

      const newGroups = group.pages.map(page => ({
        id: uuidv4(),
        pages: [page],
        status: 'pending' as const,
      }))

      const result = [...prev]
      result.splice(idx, 1, ...newGroups)

      // Re-analyze split groups
      for (const g of newGroups) {
        analyzeGroup(g)
      }

      return result
    })
  }, [analyzeGroup])

  // Remove a group
  const removeGroup = useCallback((groupId: string) => {
    setGroups(prev => prev.filter(g => g.id !== groupId))
  }, [])

  // Create tabs from ready groups
  const createTabs = useCallback(() => {
    const readyGroups = groups.filter(g => g.status === 'ready' && g.structure)

    for (const group of readyGroups) {
      addTabFromAnswerKey({
        title: group.title || 'New Exam',
        files: group.pages.map(p => p.file),
        structure: group.structure!,
      })
    }

  }, [groups, addTabFromAnswerKey])

  const readyCount = groups.filter(g => g.status === 'ready').length
  const analyzingCount = groups.filter(g => g.status === 'analyzing').length

  return (
    <div className="flex flex-col items-center w-full h-full p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6 space-y-2">
          <h2 className="text-3xl font-bold text-[#164E63]">정답지 스캔</h2>
          <p className="text-gray-500">스캐너로 정답지를 스캔하면 각각 별도 탭으로 생성됩니다.</p>
        </div>
      </div>

      {/* Scan Settings */}
      <div className="w-full max-w-2xl bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-600 font-medium">급지방식</span>
            <select
              value={scanSettings.source}
              onChange={(e) => updateScanSettings({ source: e.target.value as ScanSettings['source'] })}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              <option value="feeder">자동급지 (단면)</option>
              <option value="duplex">양면</option>
            </select>
          </label>

          <div className="flex-1" />

          <Button
            onClick={isScanning ? () => { shouldStopRef.current = true } : startScan}
            variant={isScanning ? "outline" : "cta"}
            className="gap-2"
            disabled={!isDevMode && devices.length === 0}
          >
            {isScanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                스캔 중 ({scanPageCount}장)... 중단
              </>
            ) : (
              <>
                <ScanLine className="h-4 w-4" />
                스캔 시작
              </>
            )}
          </Button>
        </div>

        {scanSettings.source === 'duplex' && (
          <p className="text-xs text-blue-600 mt-2">
            양면 모드: 앞/뒤 2페이지가 자동으로 하나의 정답지로 묶입니다.
          </p>
        )}
      </div>

      {/* Scanned Answer Keys List */}
      {groups.length > 0 && (
        <div className="w-full max-w-2xl bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4 flex-1 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            스캔된 정답지 ({groups.length}개)
          </h3>

          <div className="space-y-2">
            {groups.map((group, idx) => (
              <div
                key={group.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                  group.status === 'ready' && "border-green-200 bg-green-50",
                  group.status === 'analyzing' && "border-blue-200 bg-blue-50",
                  group.status === 'error' && "border-red-200 bg-red-50",
                  group.status === 'pending' && "border-gray-200 bg-gray-50",
                )}
              >
                {/* Status Icon */}
                <div className="shrink-0">
                  {group.status === 'ready' && <Check className="h-5 w-5 text-green-600" />}
                  {group.status === 'analyzing' && <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />}
                  {group.status === 'error' && <X className="h-5 w-5 text-red-600" />}
                  {group.status === 'pending' && <Loader2 className="h-5 w-5 text-gray-400" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-800 truncate">
                      {group.status === 'ready'
                        ? group.title
                        : group.status === 'analyzing'
                          ? '분석 중...'
                          : group.status === 'error'
                            ? '분석 실패'
                            : `정답지 ${idx + 1}`
                      }
                    </span>
                    {group.status === 'ready' && group.questionCount !== undefined && (
                      <span className="text-xs text-gray-500">({group.questionCount}문항)</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {group.pages.map(p => p.label).join(', ')}
                  </div>
                  {group.status === 'error' && group.error && (
                    <div className="text-xs text-red-600 mt-1">{group.error}</div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setPreviewGroup(group)}
                    className="p-1.5 rounded-md hover:bg-gray-200 text-gray-500 transition-colors"
                    title="미리보기"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  {group.pages.length > 1 && (
                    <button
                      onClick={() => splitGroup(group.id)}
                      className="p-1.5 rounded-md hover:bg-gray-200 text-gray-500 transition-colors"
                      title="분리"
                    >
                      <Scissors className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => removeGroup(group.id)}
                    className="p-1.5 rounded-md hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors"
                    title="삭제"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {groups.length === 0 && !isScanning && (
        <div className="w-full max-w-2xl flex-1 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <ScanLine className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p>스캔 시작을 눌러 정답지를 스캔하세요.</p>
          </div>
        </div>
      )}

      {/* Bottom Actions */}
      <div className="w-full max-w-2xl flex items-center justify-between mt-4">
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf, image/jpeg, image/png"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            파일로도 추가
          </Button>
        </div>

        <Button
          variant="cta"
          className="gap-2 px-6"
          disabled={readyCount === 0 || analyzingCount > 0}
          onClick={createTabs}
        >
          <Plus className="h-4 w-4" />
          탭 생성하기 ({readyCount}개)
        </Button>
      </div>

      {previewGroup && (
        <AnswerKeyImagePreview
          files={previewGroup.pages.map(p => p.file)}
          title={previewGroup.title || `정답지 ${groups.indexOf(previewGroup) + 1}`}
          onClose={() => setPreviewGroup(null)}
        />
      )}
    </div>
  )
}
