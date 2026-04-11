import { create } from 'zustand'
import type { ScannerAvailability, ScannerDevice } from '@/types'

interface ScannerState {
  isElectron: boolean
  available: boolean
  reason?: ScannerAvailability['reason']
  devices: ScannerDevice[]
  isRefreshing: boolean
  initialized: boolean
  initialize: () => Promise<void>
  refreshDevices: () => Promise<void>
}

const isDev = process.env.NODE_ENV === 'development'

export const useScannerStore = create<ScannerState>((set, get) => ({
  isElectron: false,
  available: isDev,
  reason: undefined,
  devices: [],
  isRefreshing: false,
  initialized: false,

  initialize: async () => {
    if (get().initialized) return

    const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron
    set({ isElectron, initialized: true })

    if (isDev && !isElectron) {
      set({
        available: true,
        devices: [{ name: 'Dev Scanner', driver: 'twain' }],
      })
      return
    }

    if (!isElectron) return

    try {
      await window.electronAPI!.scanner.checkAvailability()
      await fetchDevicesInternal(set)
    } catch (err) {
      console.error('[ScannerStore] initialize error:', err)
      set({ available: false, devices: [] })
    }
  },

  refreshDevices: async () => {
    const { isElectron } = get()
    if (!isElectron && !isDev) return
    await fetchDevicesInternal(set)
  },
}))

async function fetchDevicesInternal(
  set: (partial: Partial<ScannerState>) => void,
) {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron

  if (isDev && !isElectron) {
    set({ devices: [{ name: 'Dev Scanner', driver: 'twain' }], available: true })
    return
  }

  set({ isRefreshing: true })
  try {
    const result = await window.electronAPI!.scanner.listDevices()

    if (result.error?.type === 'permission') {
      set({ available: false, reason: 'permission-denied', devices: [], isRefreshing: false })
      return
    }

    const mapped: ScannerDevice[] = (result.devices ?? []).map(d => ({
      name: d.name,
      driver: d.driver as ScannerDevice['driver'],
      ...(d.driveLetter && { driveLetter: d.driveLetter }),
      ...(d.onTouchLitePath && { onTouchLitePath: d.onTouchLitePath }),
      ...(d.hasImageFiles !== undefined && { hasImageFiles: d.hasImageFiles }),
    }))

    if (mapped.length === 0) {
      set({ available: false, reason: 'no-device-found', devices: [], isRefreshing: false })
    } else {
      set({ available: true, reason: undefined, devices: mapped, isRefreshing: false })
    }
  } catch (err) {
    console.error('[ScannerStore] fetchDevices error:', err)
    set({ devices: [], isRefreshing: false })
  }
}
