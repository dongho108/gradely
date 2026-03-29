import { useState, useEffect, useCallback } from 'react'
import type { ScannerAvailability, ScannerDevice } from '@/types'

interface UseScannerAvailabilityReturn {
  available: boolean
  reason?: ScannerAvailability['reason']
  isElectron: boolean
  devices: ScannerDevice[]
  isRefreshing: boolean
  refreshDevices: () => void
}

const isDev = process.env.NODE_ENV === 'development'

export function useScannerAvailability(): UseScannerAvailabilityReturn {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron
  const [available, setAvailable] = useState(isDev) // dev 모드에서는 기본 true
  const [reason, setReason] = useState<ScannerAvailability['reason']>()
  const [devices, setDevices] = useState<ScannerDevice[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchDevices = useCallback(async () => {
    if (isDev && !isElectron) {
      console.log('[Scanner UI] fetchDevices: Dev 모드 → 가짜 디바이스')
      setDevices([{ name: 'Dev Scanner', driver: 'twain' }])
      return
    }
    if (!isElectron) return

    setIsRefreshing(true)
    try {
      console.log('[Scanner UI] fetchDevices: IPC 호출 시작')
      const result = await window.electronAPI!.scanner.listDevices()
      console.log('[Scanner UI] fetchDevices: IPC 결과:', JSON.stringify(result))

      // 권한 에러 처리
      if (result.error?.type === 'permission') {
        console.warn('[Scanner UI] fetchDevices: 권한 에러:', result.error.message)
        setAvailable(false)
        setReason('permission-denied')
        setDevices([])
        return
      }

      const mapped: ScannerDevice[] = (result.devices ?? []).map(d => ({
        name: d.name,
        driver: d.driver as ScannerDevice['driver'],
      }))
      setDevices(mapped)
      if (mapped.length === 0) {
        console.log('[Scanner UI] fetchDevices: 디바이스 없음')
        setAvailable(false)
        setReason('no-device-found')
      } else {
        console.log('[Scanner UI] fetchDevices: 디바이스 발견:', mapped.length, '개')
        setAvailable(true)
        setReason(undefined)
      }
    } catch (err) {
      console.error('[Scanner UI] fetchDevices: 에러:', err)
      setDevices([])
    } finally {
      setIsRefreshing(false)
    }
  }, [isElectron])

  const checkAvailability = useCallback(async () => {
    console.log('[Scanner UI] checkAvailability: isElectron =', isElectron, ', isDev =', isDev)
    if (isDev && !isElectron) {
      console.log('[Scanner UI] checkAvailability: Dev 모드 → 항상 available')
      setAvailable(true)
      fetchDevices()
      return
    }
    if (!isElectron) return
    try {
      console.log('[Scanner UI] checkAvailability: IPC 호출 시작')
      const result = await window.electronAPI!.scanner.checkAvailability()
      console.log('[Scanner UI] checkAvailability: 결과:', JSON.stringify(result))
      if (result.available) {
        await fetchDevices()
      } else {
        console.warn('[Scanner UI] checkAvailability: 사용 불가, reason:', result.reason)
        setAvailable(false)
        setReason(result.reason as ScannerAvailability['reason'])
        setDevices([])
      }
    } catch (err) {
      console.error('[Scanner UI] checkAvailability: 에러:', err)
      setAvailable(false)
      setDevices([])
    }
  }, [isElectron, fetchDevices])

  const refreshDevices = useCallback(() => {
    checkAvailability()
  }, [checkAvailability])

  useEffect(() => {
    checkAvailability()

    if (!isElectron && !isDev) return

    const interval = setInterval(checkAvailability, 30_000)
    return () => clearInterval(interval)
  }, [checkAvailability, isElectron])

  return { available, reason, isElectron: isElectron || isDev, devices, isRefreshing, refreshDevices }
}
