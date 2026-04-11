import { useEffect } from 'react'
import { useScannerStore } from '@/store/use-scanner-store'
import type { ScannerAvailability, ScannerDevice } from '@/types'

interface UseScannerAvailabilityReturn {
  available: boolean
  reason?: ScannerAvailability['reason']
  isElectron: boolean
  devices: ScannerDevice[]
  isRefreshing: boolean
  refreshDevices: () => void
}

export function useScannerAvailability(): UseScannerAvailabilityReturn {
  const available = useScannerStore(s => s.available)
  const reason = useScannerStore(s => s.reason)
  const isElectron = useScannerStore(s => s.isElectron)
  const devices = useScannerStore(s => s.devices)
  const isRefreshing = useScannerStore(s => s.isRefreshing)
  const refreshDevices = useScannerStore(s => s.refreshDevices)
  const initialize = useScannerStore(s => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return { available, reason, isElectron, devices, isRefreshing, refreshDevices }
}
