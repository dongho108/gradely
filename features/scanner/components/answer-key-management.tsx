"use client"

import { useRef, useState } from 'react'
import { Trash2, Upload, ScanLine, Eye, Image as ImageIcon, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useScanStore } from '@/store/use-scan-store'
import { AnswerKeyImagePreview } from './answer-key-image-preview'
import type { AnswerKeyEntry } from '@/types'
import { useScannerAvailability } from '../hooks/use-scanner-availability'
import { extractAnswerStructure } from '@/lib/grading-service'
import { v4 as uuidv4 } from 'uuid'

interface PendingFile {
  id: string
  fileName: string
}

export function AnswerKeyManagement() {
  const { answerKeys, addAnswerKey, removeAnswerKey } = useScanStore()
  const { available, isElectron, devices } = useScannerAvailability()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [previewKeyId, setPreviewKeyId] = useState<string | null>(null)
  const [imagePreviewKey, setImagePreviewKey] = useState<AnswerKeyEntry | null>(null)

  // USB 드라이브 스캐너 여부 판별
  const usbDevice = devices.find(d => d.driver === 'usb-drive')
  const hasNaps2Device = devices.some(d => d.driver === 'twain' || d.driver === 'wia')

  const processScannedFile = async (filePath: string, mimeType: string) => {
    const base64 = await window.electronAPI!.scanner.readScanFile(filePath)

    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: mimeType })
    const file = new File([blob], `scan-${Date.now()}.${mimeType.split('/')[1] || 'pdf'}`, { type: mimeType })

    const structure = await extractAnswerStructure(file)

    addAnswerKey({
      id: uuidv4(),
      title: structure.title || '스캔된 정답지',
      file,
      structure,
      createdAt: Date.now(),
    })

    await window.electronAPI!.scanner.cleanupScanFile(filePath)
  }

  const handleUsbScan = async () => {
    if (!usbDevice) return

    // Canon OnTouch Lite 방식: 폴더에서 가져오기
    if (usbDevice.onTouchLitePath) {
      window.electronAPI!.scanner.launchOnTouchLite(usbDevice.onTouchLitePath)
      // OnTouch Lite 실행 후 폴더 선택 다이얼로그로 이미지 가져오기
      window.alert('Capture OnTouch Lite가 실행됩니다.\n스캔 완료 후 "확인"을 눌러 저장된 이미지를 가져오세요.')
    }

    const pendingId = uuidv4()
    setPendingFiles((prev) => [...prev, { id: pendingId, fileName: 'USB 스캐너에서 가져오는 중...' }])

    try {
      let result: { files: Array<{ filePath: string; mimeType: string }> }

      if (usbDevice.hasImageFiles && usbDevice.driveLetter) {
        // USB 드라이브에 이미지가 이미 있으면 직접 가져오기
        result = await window.electronAPI!.scanner.importFromDrive(usbDevice.driveLetter)
      } else {
        // 폴더 선택 다이얼로그
        result = await window.electronAPI!.scanner.importFromFolder()
      }

      if (!result.files || result.files.length === 0) {
        window.alert('가져올 이미지 파일이 없습니다.')
        return
      }

      // 첫 번째 파일을 정답지로 처리
      await processScannedFile(result.files[0].filePath, result.files[0].mimeType)

      // 나머지 파일 정리
      for (let i = 1; i < result.files.length; i++) {
        await window.electronAPI!.scanner.cleanupScanFile(result.files[i].filePath)
      }
    } catch (err) {
      console.error('[AnswerKeyManagement] USB scan failed:', err)
      window.alert('USB 스캐너에서 이미지를 가져오는 데 실패했습니다.')
    } finally {
      setPendingFiles((prev) => prev.filter((p) => p.id !== pendingId))
    }
  }

  const handleScannerScan = async () => {
    console.log('[AnswerKeyManagement] devices:', JSON.stringify(devices))
    console.log('[AnswerKeyManagement] hasNaps2Device:', hasNaps2Device, 'usbDevice:', usbDevice)

    // USB 드라이브 스캐너는 별도 플로우 사용
    if (!hasNaps2Device && usbDevice) {
      return handleUsbScan()
    }

    const pendingId = uuidv4()
    setPendingFiles((prev) => [...prev, { id: pendingId, fileName: '스캐너 스캔 중...' }])

    try {
      const { filePath, mimeType } = await window.electronAPI!.scanner.scan()
      await processScannedFile(filePath, mimeType)
    } catch (err) {
      console.error('[AnswerKeyManagement] Scanner scan failed:', err)
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('output file not found') || message.includes('No pages')) {
        window.alert('스캐너에 문서가 감지되지 않았습니다. 급지대에 문서를 올려놓고 다시 시도해 주세요.')
      } else if (message.includes('timed out')) {
        window.alert('스캔 시간이 초과되었습니다. 스캐너 상태를 확인해 주세요.')
      } else if (message.includes('already in progress')) {
        window.alert('이미 스캔이 진행 중입니다.')
      } else {
        window.alert('스캔에 실패했습니다. 스캐너 연결 상태를 확인해 주세요.')
      }
    } finally {
      setPendingFiles((prev) => prev.filter((p) => p.id !== pendingId))
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const pendingId = uuidv4()
    setPendingFiles((prev) => [...prev, { id: pendingId, fileName: file.name }])

    try {
      const structure = await extractAnswerStructure(file)

      addAnswerKey({
        id: uuidv4(),
        title: structure.title || file.name,
        file,
        structure,
        createdAt: Date.now(),
      })
    } catch (err) {
      console.error('[AnswerKeyManagement] Failed to process answer key:', err)
    } finally {
      setPendingFiles((prev) => prev.filter((p) => p.id !== pendingId))
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">정답지 관리</h3>
        <div className="flex gap-2">
          {isElectron && available && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleScannerScan}
            >
              <ScanLine className="mr-1.5 h-4 w-4" />
              스캐너로 스캔
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-4 w-4" />
            파일 업로드
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {answerKeys.length === 0 && pendingFiles.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          등록된 정답지가 없습니다. 파일을 업로드하여 정답지를 등록하세요.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {answerKeys.map((key) => (
            <li key={key.id}>
              <div className="flex items-center justify-between py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {key.title}
                  </p>
                  <p className="text-xs text-gray-500">
                    {key.structure.totalQuestions}문항 &middot;{' '}
                    {new Date(key.createdAt).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <button
                    onClick={() =>
                      setPreviewKeyId((prev) => (prev === key.id ? null : key.id))
                    }
                    className={`p-1.5 rounded-md transition-colors ${
                      previewKeyId === key.id
                        ? 'bg-blue-50 text-blue-600'
                        : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
                    }`}
                    aria-label="미리보기"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setImagePreviewKey(key)}
                    className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="원본 이미지 보기"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeAnswerKey(key.id)}
                    className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {previewKeyId === key.id && (
                <div className="pb-3 px-1">
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                      {Object.entries(key.structure.answers).map(([qNum, ans]) => (
                        <div key={qNum} className="contents">
                          <span className="font-medium text-gray-500 tabular-nums">
                            {qNum}.
                          </span>
                          <span className="text-gray-800">
                            {ans.text}
                            {ans.question && (
                              <span className="ml-2 text-gray-400">
                                ({ans.question})
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
          {pendingFiles.map((pf) => (
            <li key={pf.id} className="flex items-center gap-3 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-500 truncate">{pf.fileName}</p>
                <p className="text-xs text-gray-400">분석 중...</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {imagePreviewKey && (
        <AnswerKeyImagePreview
          file={imagePreviewKey.file}
          title={imagePreviewKey.title}
          onClose={() => setImagePreviewKey(null)}
        />
      )}
    </div>
  )
}
