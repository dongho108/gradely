"use client"

import { useState, useRef, useEffect } from 'react'
import { useScanStore, type ScanSettings } from '@/store/use-scan-store'
import { useTabScan } from '@/features/scanner/hooks/use-tab-scan'
import { useScannerAvailability } from '@/features/scanner/hooks/use-scanner-availability'
import { ScanProgressBar } from './scan-progress-bar'
import { useTabStore } from '@/store/use-tab-store'
import { Button } from '@/components/ui/button'
import { ScanLine, X, Upload } from 'lucide-react'

interface ScanSettingsPopoverProps {
  tabId: string
  onClose: () => void
}

export function ScanSettingsPopover({ tabId, onClose }: ScanSettingsPopoverProps) {
  const { scanSettings, updateScanSettings } = useScanStore()
  const { isScanning, pageCount, lastError, startScan, stopScan } = useTabScan(tabId)
  const { addSubmission, setSubmissionStatus } = useTabStore()
  const { devices } = useScannerAvailability()
  const popoverRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isDevMode = process.env.NODE_ENV === 'development'
    && (typeof window === 'undefined' || !window.electronAPI?.isElectron)

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) && !isScanning) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose, isScanning])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      const id = Math.random().toString(36).substring(2, 9)
      addSubmission(tabId, file, id)
      setSubmissionStatus(tabId, id, 'queued')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleStartScan = () => {
    startScan({
      scanOptions: {
        source: scanSettings.source,
      },
    })
  }

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl border border-gray-200 shadow-lg z-20 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <h4 className="text-sm font-semibold text-gray-700">학생 답안 스캔</h4>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-gray-100 text-gray-400 transition-colors"
          disabled={isScanning}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        <label className="text-xs block">
          <span className="text-gray-500 block mb-1">급지방식</span>
          <select
            value={scanSettings.source}
            onChange={(e) => updateScanSettings({ source: e.target.value as ScanSettings['source'] })}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
            disabled={isScanning}
          >
            <option value="feeder">자동급지 (단면)</option>
            <option value="duplex">양면</option>
          </select>
        </label>

        <Button
          onClick={isScanning ? stopScan : handleStartScan}
          variant={isScanning ? "outline" : "cta"}
          className="w-full gap-2"
          disabled={!isDevMode && devices.length === 0}
        >
          <ScanLine className="h-4 w-4" />
          {isScanning ? '스캔 중단' : '스캔 시작'}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={isScanning}
        >
          <Upload className="h-4 w-4" />
          파일로도 추가
        </Button>
      </div>

      <ScanProgressBar
        pageCount={pageCount}
        isScanning={isScanning}
        onStop={stopScan}
        lastError={lastError}
      />
    </div>
  )
}
