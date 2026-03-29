"use client"

import { useScannerAvailability } from '../hooks/use-scanner-availability'
import { useScanStore } from '@/store/use-scan-store'
import { RefreshCw } from 'lucide-react'

export function ScannerStatusIndicator() {
  const { available, reason, isElectron, devices, isRefreshing, refreshDevices } = useScannerAvailability()

  const isDev = process.env.NODE_ENV === 'development'
  if (!isElectron && !isDev) return null

  const handleClick = () => {
    if (available) {
      useScanStore.getState().openWorkflow()
    }
  }

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation()
    refreshDevices()
  }

  const deviceName = devices.length > 0 ? devices[0].name : null
  const showRefresh = reason !== 'windows-only' && reason !== 'naps2-not-found'

  // NAPS2 있지만 물리 스캐너 없음
  const isNoDevice = reason === 'no-device-found'
  const isPermissionDenied = reason === 'permission-denied'

  const dotColor = available ? 'bg-green-500' : isPermissionDenied ? 'bg-yellow-500' : 'bg-red-500'
  const textColor = available ? 'text-green-700' : isPermissionDenied ? 'text-yellow-700' : 'text-red-600'

  const label = available && deviceName
    ? deviceName
    : isPermissionDenied
      ? '스캐너 권한 필요'
      : isNoDevice
        ? '스캐너 없음'
        : '스캐너 미연결'

  return (
    <div className="flex items-center">
      <button
        onClick={handleClick}
        disabled={!available}
        className={`flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1.5 transition-colors ${
          available
            ? 'hover:bg-green-50 cursor-pointer'
            : 'cursor-default'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        <span className={textColor}>{label}</span>
      </button>
      {showRefresh && (
        <button
          onClick={handleRefresh}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
          title="스캐너 새로고침"
        >
          <RefreshCw
            className={`h-3 w-3 text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`}
          />
        </button>
      )}
    </div>
  )
}
