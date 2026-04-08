import { create } from 'zustand'
import type { AnswerKeyEntry, ScanSession, ScannedPage, ClassifiedStudent } from '@/types'
import type { StudentExamStructure } from '@/types/grading'

export interface ScanSettings {
  source: 'glass' | 'feeder' | 'duplex'
}

interface ScanState {
  // Answer keys (persist across sessions)
  answerKeys: AnswerKeyEntry[]

  // Persisted scan preferences
  scanSettings: ScanSettings

  // Legacy: scan workflow overlay (kept for backward compat, will be removed in Phase 4)
  isScanWorkflowOpen: boolean
  activeScanSession: ScanSession | null
  scannedPages: ScannedPage[]
  classifiedStudents: ClassifiedStudent[]
}

interface ScanActions {
  // Answer key management
  addAnswerKey: (entry: AnswerKeyEntry) => void
  removeAnswerKey: (id: string) => void

  // Scan settings
  updateScanSettings: (settings: Partial<ScanSettings>) => void

  // Legacy workflow
  openWorkflow: () => void
  closeWorkflow: () => void

  // Scanning
  addScannedPage: (page: ScannedPage) => void
  updatePageOcrResult: (pageId: string, ocrResult: StudentExamStructure) => void
  setClassifiedStudents: (students: ClassifiedStudent[]) => void

  // Session
  resetSession: () => void
}

const defaultScanSettings: ScanSettings = {
  source: 'feeder',
}

export const useScanStore = create<ScanState & ScanActions>()((set) => ({
  answerKeys: [],
  scanSettings: defaultScanSettings,
  isScanWorkflowOpen: false,
  activeScanSession: null,
  scannedPages: [],
  classifiedStudents: [],

  addAnswerKey: (entry) =>
    set((state) => ({
      answerKeys: state.answerKeys.some((k) => k.id === entry.id)
        ? state.answerKeys.map((k) => (k.id === entry.id ? entry : k))
        : [...state.answerKeys, entry],
    })),

  removeAnswerKey: (id) =>
    set((state) => ({
      answerKeys: state.answerKeys.filter((k) => k.id !== id),
    })),

  updateScanSettings: (settings) =>
    set((state) => ({
      scanSettings: { ...state.scanSettings, ...settings },
    })),

  openWorkflow: () => set({ isScanWorkflowOpen: true }),
  closeWorkflow: () => set({ isScanWorkflowOpen: false }),

  addScannedPage: (page) =>
    set((state) => ({
      scannedPages: [...state.scannedPages, page],
    })),

  updatePageOcrResult: (pageId, ocrResult) =>
    set((state) => ({
      scannedPages: state.scannedPages.map((p) =>
        p.id === pageId ? { ...p, ocrResult } : p,
      ),
    })),

  setClassifiedStudents: (students) =>
    set({ classifiedStudents: students }),

  resetSession: () => set({ isScanWorkflowOpen: false, activeScanSession: null, scannedPages: [], classifiedStudents: [] }),
}))
