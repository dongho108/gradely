"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircle, X, Upload, FileText, Usb, FolderOpen, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useScanStore } from "@/store/use-scan-store"
import { useBatchScan } from "../hooks/use-batch-scan"
import { useScannerAvailability } from "../hooks/use-scanner-availability"
import type { ScanOptions, ScannerDevice } from "@/types"

interface BatchScanModalProps {
  open: boolean
  onClose: () => void
  onScanComplete: () => void
}

type Source = "feeder" | "glass" | "duplex"
type PageMode = "auto" | "fixed"

export function BatchScanModal({ open, onClose, onScanComplete }: BatchScanModalProps) {
  const { answerKeys } = useScanStore()
  const { isScanning, pageCount, lastError, startScan, stopScan, addFiles, importFromFolder, importFromDrive, isDevMode } = useBatchScan()
  const { devices } = useScannerAvailability()

  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null)
  const [selectedDevice, setSelectedDevice] = useState<ScannerDevice | null>(null)
  const [source, setSource] = useState<Source>("feeder")
  const [pageMode, setPageMode] = useState<PageMode>("auto")
  const [fixedPageCount, setFixedPageCount] = useState(2)
  const [onTouchLaunched, setOnTouchLaunched] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const usbDevices = devices.filter(d => d.driver === 'usb-drive')
  const isUsbMode = selectedDevice?.driver === 'usb-drive'

  const fileInputRef = useRef<HTMLInputElement>(null)
  const wasScanningRef = useRef(false)

  useEffect(() => {
    if (wasScanningRef.current && !isScanning && pageCount > 0) {
      onScanComplete()
    }
    wasScanningRef.current = isScanning
  }, [isScanning, pageCount, onScanComplete])

  if (!open) return null

  function handleStartScan() {
    const scanOptions: ScanOptions = {
      source,
    }
    startScan({ scanOptions })
  }

  function handleDevFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    addFiles(Array.from(files))
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isScanning) onClose()
      }}
    >
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">배치 스캔</h2>
            {isDevMode && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                DEV
              </span>
            )}
          </div>
          {!isScanning && (
            <button
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-6">
          {/* 1. 정답지 선택 */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">정답지 선택</h3>
            {answerKeys.length === 0 ? (
              <p className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-500">
                등록된 정답지가 없습니다. 먼저 정답지를 등록해 주세요.
              </p>
            ) : (
              <div className="space-y-2">
                {answerKeys.map((key) => (
                  <label
                    key={key.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                      selectedKeyId === key.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="answerKey"
                      value={key.id}
                      checked={selectedKeyId === key.id}
                      onChange={() => setSelectedKeyId(key.id)}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{key.title}</p>
                      <p className="text-xs text-gray-500">
                        {key.structure?.totalQuestions ?? 0}문항
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </section>

          {/* 디바이스 선택 (USB 디바이스가 있을 때) */}
          {!isDevMode && usbDevices.length > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">스캐너 선택</h3>
              <div className="space-y-2">
                {/* TWAIN/WIA 옵션 */}
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    !isUsbMode ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="deviceType"
                    checked={!isUsbMode}
                    onChange={() => setSelectedDevice(null)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  <span className="text-sm text-gray-900">TWAIN/WIA 스캐너</span>
                </label>
                {/* USB 디바이스들 */}
                {usbDevices.map((d, i) => (
                  <label
                    key={`usb-${i}`}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                      selectedDevice === d ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="deviceType"
                      checked={selectedDevice === d}
                      onChange={() => { setSelectedDevice(d); setOnTouchLaunched(false) }}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <Usb className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-900">{d.name}</span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {isDevMode ? (
            /* Dev 모드: 파일 업로드로 스캔 대체 */
            <section>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">
                답안지 파일 업로드
                <span className="ml-2 text-xs font-normal text-gray-400">(스캔 대체)</span>
              </h3>
              <div
                className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-gray-300 px-6 py-8 transition-colors hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-gray-400" />
                <p className="text-sm text-gray-600">
                  클릭하여 PDF/이미지 파일을 선택하세요
                </p>
                <p className="text-xs text-gray-400">
                  여러 파일을 한번에 선택할 수 있습니다
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  multiple
                  onChange={handleDevFileUpload}
                  className="hidden"
                />
              </div>
              {pageCount > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-green-50 px-4 py-2.5 text-sm text-green-700">
                  <FileText className="h-4 w-4" />
                  <span>{pageCount}개 파일 업로드됨</span>
                </div>
              )}
            </section>
          ) : isUsbMode ? (
            /* USB 드라이브 모드 */
            <section>
              <h3 className="mb-3 text-sm font-semibold text-gray-700">
                <Usb className="inline h-4 w-4 mr-1" />
                USB 스캐너
              </h3>
              {selectedDevice?.onTouchLitePath ? (
                /* Canon 모드: ONTOUCHL.exe 실행 → 폴더 가져오기 */
                <div className="space-y-4">
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                    <p className="text-sm text-blue-800 font-medium mb-2">Canon 스캐너 워크플로우</p>
                    <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                      <li>아래 버튼으로 Capture OnTouch Lite를 실행하세요</li>
                      <li>OnTouch Lite에서 스캔한 이미지를 원하는 폴더에 저장하세요</li>
                      <li>&quot;이미지 가져오기&quot; 버튼으로 저장된 이미지를 가져오세요</li>
                    </ol>
                  </div>
                  {!onTouchLaunched ? (
                    <Button
                      className="w-full"
                      onClick={() => {
                        window.electronAPI!.scanner.launchOnTouchLite(selectedDevice.onTouchLitePath!)
                        setOnTouchLaunched(true)
                      }}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Capture OnTouch Lite 실행
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
                        <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                        OnTouch Lite가 실행되었습니다. 이미지를 저장한 후 아래 버튼을 누르세요.
                      </div>
                      <Button
                        className="w-full"
                        variant="primary"
                        disabled={isImporting}
                        onClick={async () => {
                          setIsImporting(true)
                          await importFromFolder()
                          setIsImporting(false)
                        }}
                      >
                        <FolderOpen className="h-4 w-4 mr-2" />
                        {isImporting ? '가져오는 중...' : '이미지 가져오기 (폴더 선택)'}
                      </Button>
                    </div>
                  )}
                </div>
              ) : selectedDevice?.hasImageFiles ? (
                /* 일반 USB: 드라이브에서 직접 가져오기 */
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    USB 드라이브에서 이미지 파일을 가져옵니다.
                  </p>
                  <Button
                    className="w-full"
                    disabled={isImporting}
                    onClick={async () => {
                      setIsImporting(true)
                      await importFromDrive(selectedDevice.driveLetter!)
                      setIsImporting(false)
                    }}
                  >
                    <Usb className="h-4 w-4 mr-2" />
                    {isImporting ? '가져오는 중...' : `USB에서 이미지 가져오기 (${selectedDevice.driveLetter})`}
                  </Button>
                  <button
                    className="text-xs text-blue-600 hover:underline"
                    disabled={isImporting}
                    onClick={async () => {
                      setIsImporting(true)
                      await importFromFolder()
                      setIsImporting(false)
                    }}
                  >
                    다른 폴더에서 가져오기...
                  </button>
                </div>
              ) : null}
              {pageCount > 0 && (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-green-50 px-4 py-2.5 text-sm text-green-700">
                  <FileText className="h-4 w-4" />
                  <span>{pageCount}개 이미지 가져옴</span>
                </div>
              )}
            </section>
          ) : (
            /* 프로덕션: TWAIN/WIA 스캔 설정 */
            <>
              <section>
                <h3 className="mb-3 text-sm font-semibold text-gray-700">스캔 설정</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="w-24 shrink-0 text-sm text-gray-600">급지방식</label>
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value as Source)}
                      className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="feeder">자동급지</option>
                      <option value="duplex">양면</option>
                    </select>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* 3. 다페이지 설정 */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">다페이지 설정</h3>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50">
                <input
                  type="radio"
                  name="pageMode"
                  value="auto"
                  checked={pageMode === "auto"}
                  onChange={() => setPageMode("auto")}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">자동감지</p>
                  <p className="text-xs text-gray-500">
                    OCR이 학생/시험명을 자동으로 감지하여 그룹핑
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50">
                <input
                  type="radio"
                  name="pageMode"
                  value="fixed"
                  checked={pageMode === "fixed"}
                  onChange={() => setPageMode("fixed")}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">고정장수</p>
                  {pageMode === "fixed" && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-500">학생당</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={fixedPageCount}
                        onChange={(e) =>
                          setFixedPageCount(Math.max(1, parseInt(e.target.value) || 1))
                        }
                        className="w-16 rounded-md border border-gray-300 px-2 py-1 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-500">장</span>
                    </div>
                  )}
                </div>
              </label>
            </div>
          </section>

          {/* Error banner */}
          {lastError && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{lastError}</p>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between border-t bg-gray-50 px-6 py-4 rounded-b-xl">
          {isScanning ? (
            <>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                <span>스캔 중...</span>
                <span className="font-semibold text-blue-600">{pageCount}페이지</span>
                <span>완료</span>
              </div>
              <Button variant="primary" className="bg-red-600 hover:bg-red-700" onClick={stopScan}>
                중단
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                취소
              </Button>
              {isDevMode || isUsbMode ? (
                <Button
                  onClick={onScanComplete}
                  disabled={!selectedKeyId || answerKeys.length === 0 || pageCount === 0}
                >
                  분류 시작 ({pageCount}페이지)
                </Button>
              ) : (
                <Button
                  onClick={handleStartScan}
                  disabled={!selectedKeyId || answerKeys.length === 0}
                >
                  스캔 시작
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
