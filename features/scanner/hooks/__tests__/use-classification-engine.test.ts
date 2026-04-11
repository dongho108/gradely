import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ScannedPage, ClassifiedStudent, AnswerKeyEntry } from '@/types'
import type { StudentExamStructure } from '@/types/grading'

// ---------------------------------------------------------------------------
// Shared mock state (declared before vi.mock factories, mutated in beforeEach)
// ---------------------------------------------------------------------------

const mockUpdatePageOcrResult = vi.fn()
const mockSetClassifiedStudents = vi.fn()

let mockScannedPages: ScannedPage[] = []
let mockAnswerKeys: AnswerKeyEntry[] = []

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/store/use-scan-store', () => ({
  useScanStore: Object.assign(
    vi.fn(() => ({
      updatePageOcrResult: mockUpdatePageOcrResult,
      setClassifiedStudents: mockSetClassifiedStudents,
    })),
    {
      getState: vi.fn(() => ({
        scannedPages: mockScannedPages,
        answerKeys: mockAnswerKeys,
      })),
    },
  ),
}))

vi.mock('@/lib/grading-service', () => ({
  extractExamStructure: vi.fn(),
}))

vi.mock('@/lib/scan-utils', () => ({
  matchExamTitle: vi.fn(),
  groupPagesByStudent: vi.fn(),
  groupPagesByFixedCount: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import the mocked modules AFTER vi.mock declarations so we can control them
// ---------------------------------------------------------------------------

import { extractExamStructure } from '@/lib/grading-service'
import { matchExamTitle, groupPagesByStudent, groupPagesByFixedCount } from '@/lib/scan-utils'
import { useScanStore } from '@/store/use-scan-store'
import { useClassificationEngine } from '../use-classification-engine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string): File {
  return new File(['dummy'], name, { type: 'image/png' })
}

function makePage(id: string, ocrResult?: StudentExamStructure): ScannedPage {
  return { id, file: makeFile(`${id}.png`), ocrResult }
}

function makeOcrResult(studentName: string, examTitle: string): StudentExamStructure {
  return { studentName, examTitle, answers: {}, totalQuestions: 0 }
}

function makeAnswerKey(id: string, title: string): AnswerKeyEntry {
  return {
    id,
    title,
    files: [makeFile(`${id}.pdf`)],
    structure: { title, answers: {}, totalQuestions: 0 },
    createdAt: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// beforeEach: reset mocks and state
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockScannedPages = []
  mockAnswerKeys = []

  // Keep getState in sync with the mutable arrays
  ;(useScanStore as any).getState = vi.fn(() => ({
    scannedPages: mockScannedPages,
    answerKeys: mockAnswerKeys,
  }))
})

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('useClassificationEngine', () => {
  // ── initial state ──────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('returns idle state before classification starts', () => {
      const { result } = renderHook(() => useClassificationEngine())
      expect(result.current.isClassifying).toBe(false)
      expect(result.current.progress).toBe(0)
      expect(result.current.currentPage).toBe(0)
      expect(result.current.totalPages).toBe(0)
      expect(result.current.classificationSummary).toBeNull()
    })
  })

  // ── early return when no pages ─────────────────────────────────────────────

  describe('early return', () => {
    it('does nothing when scannedPages is empty', async () => {
      mockScannedPages = []
      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification()
      })

      expect(extractExamStructure).not.toHaveBeenCalled()
      expect(result.current.isClassifying).toBe(false)
    })
  })

  // ── parallel processing ────────────────────────────────────────────────────

  describe('parallel processing', () => {
    it('processes 10 pages with MAX_CONCURRENT=5 concurrency ceiling', async () => {
      const pages = Array.from({ length: 10 }, (_, i) => makePage(`page-${i}`))
      mockScannedPages = pages

      let maxActive = 0
      let currentActive = 0

      vi.mocked(extractExamStructure).mockImplementation((_file: File) => {
        currentActive++
        if (currentActive > maxActive) maxActive = currentActive

        return new Promise<StudentExamStructure>((resolve) => {
          // Resolve on next microtask so concurrency can build up
          queueMicrotask(() => {
            currentActive--
            resolve(makeOcrResult('Student', 'Exam A'))
          })
        })
      })

      vi.mocked(groupPagesByStudent).mockReturnValue([])

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'auto' })
      })

      expect(extractExamStructure).toHaveBeenCalledTimes(10)
      expect(maxActive).toBeLessThanOrEqual(5)
    })

    it('calls extractExamStructure once per page with the page file', async () => {
      const pages = [makePage('p1'), makePage('p2'), makePage('p3')]
      mockScannedPages = pages

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('Student', 'Exam A'))
      vi.mocked(groupPagesByStudent).mockReturnValue([])

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'auto' })
      })

      expect(extractExamStructure).toHaveBeenCalledTimes(3)
      expect(extractExamStructure).toHaveBeenCalledWith(pages[0].file)
      expect(extractExamStructure).toHaveBeenCalledWith(pages[1].file)
      expect(extractExamStructure).toHaveBeenCalledWith(pages[2].file)
    })
  })

  // ── progress tracking ──────────────────────────────────────────────────────

  describe('progress tracking', () => {
    it('sets totalPages to the number of scanned pages', async () => {
      const pages = Array.from({ length: 4 }, (_, i) => makePage(`p-${i}`))
      mockScannedPages = pages

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('Student', 'Exam'))
      vi.mocked(groupPagesByStudent).mockReturnValue([])

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'auto' })
      })

      expect(result.current.totalPages).toBe(4)
    })

    it('reaches progress=100 and currentPage=totalPages after completion', async () => {
      const pages = Array.from({ length: 3 }, (_, i) => makePage(`p-${i}`))
      mockScannedPages = pages

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('Student', 'Exam'))
      vi.mocked(groupPagesByStudent).mockReturnValue([])

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'auto' })
      })

      expect(result.current.progress).toBe(100)
      expect(result.current.currentPage).toBe(3)
    })

    it('sets isClassifying=true during processing, false after done', async () => {
      const pages = [makePage('p1')]
      mockScannedPages = pages

      let resolveOcr!: (v: StudentExamStructure) => void
      vi.mocked(extractExamStructure).mockReturnValue(
        new Promise<StudentExamStructure>((res) => { resolveOcr = res }),
      )
      vi.mocked(groupPagesByStudent).mockReturnValue([])

      const { result } = renderHook(() => useClassificationEngine())

      let classifyPromise: Promise<void>
      act(() => {
        classifyPromise = result.current.startClassification({ mode: 'auto' })
      })

      // Still classifying (OCR not yet resolved)
      expect(result.current.isClassifying).toBe(true)

      await act(async () => {
        resolveOcr(makeOcrResult('Student', 'Exam'))
        await classifyPromise!
      })

      expect(result.current.isClassifying).toBe(false)
    })
  })

  // ── store updates ──────────────────────────────────────────────────────────

  describe('store updates', () => {
    it('calls updatePageOcrResult for each page with the returned OCR result', async () => {
      const pages = [makePage('p1'), makePage('p2')]
      mockScannedPages = pages

      const ocrA = makeOcrResult('Alice', 'Exam A')
      const ocrB = makeOcrResult('Bob', 'Exam A')

      vi.mocked(extractExamStructure)
        .mockResolvedValueOnce(ocrA)
        .mockResolvedValueOnce(ocrB)

      vi.mocked(groupPagesByStudent).mockReturnValue([])

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'auto' })
      })

      expect(mockUpdatePageOcrResult).toHaveBeenCalledTimes(2)
      expect(mockUpdatePageOcrResult).toHaveBeenCalledWith('p1', ocrA)
      expect(mockUpdatePageOcrResult).toHaveBeenCalledWith('p2', ocrB)
    })

    it('does not throw when extractExamStructure rejects; other pages still processed', async () => {
      const pages = [makePage('p1'), makePage('p2'), makePage('p3')]
      mockScannedPages = pages

      const ocrGood = makeOcrResult('Student', 'Exam A')

      vi.mocked(extractExamStructure)
        .mockResolvedValueOnce(ocrGood)
        .mockRejectedValueOnce(new Error('OCR failed'))
        .mockResolvedValueOnce(ocrGood)

      vi.mocked(groupPagesByStudent).mockReturnValue([])

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'auto' })
      })

      // Only 2 successes → 2 store updates
      expect(mockUpdatePageOcrResult).toHaveBeenCalledTimes(2)
      expect(result.current.progress).toBe(100)
    })
  })

  // ── auto mode: groupPagesByStudent ────────────────────────────────────────

  describe('mode=auto grouping', () => {
    it('calls groupPagesByStudent with updated pages and answer keys', async () => {
      const pages = [makePage('p1')]
      mockScannedPages = pages
      const answerKey = makeAnswerKey('key1', 'Exam A')
      mockAnswerKeys = [answerKey]

      const updatedPages = [makePage('p1', makeOcrResult('Alice', 'Exam A'))]

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('Alice', 'Exam A'))
      vi.mocked(groupPagesByStudent).mockReturnValue([
        { name: 'Alice', examTitle: 'Exam A', pages: updatedPages, answerKeyId: 'key1' },
      ])

      // After OCR, getState returns updated pages
      ;(useScanStore as any).getState
        .mockReturnValueOnce({ scannedPages: pages, answerKeys: mockAnswerKeys })  // first call (pre-loop)
        .mockReturnValueOnce({ scannedPages: pages, answerKeys: mockAnswerKeys })  // second call (pre-loop answerKeys)
        .mockReturnValue({ scannedPages: updatedPages, answerKeys: mockAnswerKeys }) // post-loop calls

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'auto' })
      })

      expect(groupPagesByStudent).toHaveBeenCalledWith(updatedPages, mockAnswerKeys)
      expect(mockSetClassifiedStudents).toHaveBeenCalledWith([
        { name: 'Alice', examTitle: 'Exam A', pages: updatedPages, answerKeyId: 'key1' },
      ])
    })

    it('groups multiple pages of the same student into one ClassifiedStudent', async () => {
      const p1 = makePage('p1')
      const p2 = makePage('p2')
      mockScannedPages = [p1, p2]

      const ocrAlice = makeOcrResult('Alice', 'Exam A')
      vi.mocked(extractExamStructure).mockResolvedValue(ocrAlice)

      const grouped: ClassifiedStudent[] = [
        { name: 'Alice', examTitle: 'Exam A', pages: [p1, p2], answerKeyId: 'key1' },
      ]
      vi.mocked(groupPagesByStudent).mockReturnValue(grouped)

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'auto' })
      })

      expect(mockSetClassifiedStudents).toHaveBeenCalledWith(grouped)
    })

    it('pages with no OCR match end up unclassified (name="" examTitle="")', async () => {
      const pages = [makePage('p1'), makePage('p2')]
      mockScannedPages = pages

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('', ''))

      const unclassifiedGroup: ClassifiedStudent = {
        name: '',
        examTitle: '',
        pages,
        answerKeyId: '',
      }
      vi.mocked(groupPagesByStudent).mockReturnValue([unclassifiedGroup])

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'auto' })
      })

      expect(result.current.classificationSummary?.unclassifiedCount).toBe(1)
      expect(result.current.classificationSummary?.totalStudents).toBe(1)
    })
  })

  // ── fixed mode: groupPagesByFixedCount ────────────────────────────────────

  describe('mode=fixed grouping', () => {
    it('calls groupPagesByFixedCount with fixedPageCount option', async () => {
      const pages = Array.from({ length: 4 }, (_, i) => makePage(`p-${i}`))
      mockScannedPages = pages

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('', ''))

      const group1 = [pages[0], pages[1]]
      const group2 = [pages[2], pages[3]]
      vi.mocked(groupPagesByFixedCount).mockReturnValue([group1, group2])
      vi.mocked(matchExamTitle).mockReturnValue(null)

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'fixed', fixedPageCount: 2 })
      })

      expect(groupPagesByFixedCount).toHaveBeenCalledWith(expect.any(Array), 2)
    })

    it('creates one ClassifiedStudent per fixed group', async () => {
      const p0 = makePage('p0', makeOcrResult('Alice', 'Exam A'))
      const p1 = makePage('p1', makeOcrResult('Alice', 'Exam A'))
      const p2 = makePage('p2', makeOcrResult('Bob', 'Exam B'))
      mockScannedPages = [p0, p1, p2]

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('', ''))

      vi.mocked(groupPagesByFixedCount).mockReturnValue([[p0, p1], [p2]])
      vi.mocked(matchExamTitle).mockReturnValue(null)

      // getState returns pages with ocrResult already set
      ;(useScanStore as any).getState.mockReturnValue({
        scannedPages: [p0, p1, p2],
        answerKeys: mockAnswerKeys,
      })

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'fixed', fixedPageCount: 2 })
      })

      const call = mockSetClassifiedStudents.mock.calls[0][0] as ClassifiedStudent[]
      expect(call).toHaveLength(2)
      expect(call[0].name).toBe('Alice')
      expect(call[0].examTitle).toBe('Exam A')
      expect(call[1].name).toBe('Bob')
      expect(call[1].examTitle).toBe('Exam B')
    })

    it('uses matchExamTitle to resolve answerKeyId in fixed mode', async () => {
      const p0 = makePage('p0', makeOcrResult('Alice', 'Exam A'))
      mockScannedPages = [p0]

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('Alice', 'Exam A'))
      vi.mocked(groupPagesByFixedCount).mockReturnValue([[p0]])

      const answerKey = makeAnswerKey('key-xyz', 'Exam A')
      mockAnswerKeys = [answerKey]
      vi.mocked(matchExamTitle).mockReturnValue(answerKey)

      ;(useScanStore as any).getState.mockReturnValue({
        scannedPages: [p0],
        answerKeys: mockAnswerKeys,
      })

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'fixed', fixedPageCount: 1 })
      })

      const call = mockSetClassifiedStudents.mock.calls[0][0] as ClassifiedStudent[]
      expect(call[0].answerKeyId).toBe('key-xyz')
    })

    it('uses Student N fallback name when ocrResult has no studentName in fixed mode', async () => {
      const p0 = makePage('p0') // no ocrResult
      mockScannedPages = [p0]

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('', ''))
      vi.mocked(groupPagesByFixedCount).mockReturnValue([[p0]])
      vi.mocked(matchExamTitle).mockReturnValue(null)

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'fixed', fixedPageCount: 1 })
      })

      const call = mockSetClassifiedStudents.mock.calls[0][0] as ClassifiedStudent[]
      expect(call[0].name).toBe('Student 1')
    })
  })

  // ── classificationSummary ──────────────────────────────────────────────────

  describe('classificationSummary', () => {
    it('counts students per examTitle', async () => {
      const pages = [makePage('p1'), makePage('p2'), makePage('p3')]
      mockScannedPages = pages

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('', ''))
      vi.mocked(groupPagesByStudent).mockReturnValue([
        { name: 'Alice', examTitle: 'Exam A', pages: [pages[0]], answerKeyId: 'k1' },
        { name: 'Bob', examTitle: 'Exam A', pages: [pages[1]], answerKeyId: 'k1' },
        { name: 'Carol', examTitle: 'Exam B', pages: [pages[2]], answerKeyId: 'k2' },
      ])

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'auto' })
      })

      expect(result.current.classificationSummary?.byExamTitle).toEqual({
        'Exam A': 2,
        'Exam B': 1,
      })
      expect(result.current.classificationSummary?.totalStudents).toBe(3)
      expect(result.current.classificationSummary?.unclassifiedCount).toBe(0)
    })

    it('counts unclassified students (no name or no examTitle)', async () => {
      const pages = [makePage('p1'), makePage('p2'), makePage('p3')]
      mockScannedPages = pages

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('', ''))
      vi.mocked(groupPagesByStudent).mockReturnValue([
        { name: 'Alice', examTitle: 'Exam A', pages: [pages[0]], answerKeyId: 'k1' },
        { name: '', examTitle: '', pages: [pages[1], pages[2]], answerKeyId: '' }, // unclassified group
      ])

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'auto' })
      })

      expect(result.current.classificationSummary?.unclassifiedCount).toBe(1)
      expect(result.current.classificationSummary?.byExamTitle).toEqual({ 'Exam A': 1 })
      expect(result.current.classificationSummary?.totalStudents).toBe(2)
    })

    it('handles student with name but missing examTitle as unclassified', async () => {
      const pages = [makePage('p1')]
      mockScannedPages = pages

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('', ''))
      vi.mocked(groupPagesByStudent).mockReturnValue([
        { name: 'Dave', examTitle: '', pages, answerKeyId: '' },
      ])

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'auto' })
      })

      expect(result.current.classificationSummary?.unclassifiedCount).toBe(1)
      expect(result.current.classificationSummary?.byExamTitle).toEqual({})
    })

    it('returns empty summary for all unclassified pages', async () => {
      const pages = [makePage('p1')]
      mockScannedPages = pages

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('', ''))
      vi.mocked(groupPagesByStudent).mockReturnValue([
        { name: '', examTitle: '', pages, answerKeyId: '' },
      ])

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'auto' })
      })

      expect(result.current.classificationSummary).toEqual({
        byExamTitle: {},
        unclassifiedCount: 1,
        totalStudents: 1,
      })
    })

    it('summary is null before classification runs', () => {
      mockScannedPages = [makePage('p1')]
      const { result } = renderHook(() => useClassificationEngine())
      expect(result.current.classificationSummary).toBeNull()
    })
  })

  // ── default option values ──────────────────────────────────────────────────

  describe('default options', () => {
    it('defaults to mode=auto when no options passed', async () => {
      const pages = [makePage('p1')]
      mockScannedPages = pages

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('Alice', 'Exam'))
      vi.mocked(groupPagesByStudent).mockReturnValue([])

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification()
      })

      expect(groupPagesByStudent).toHaveBeenCalled()
      expect(groupPagesByFixedCount).not.toHaveBeenCalled()
    })

    it('defaults fixedPageCount to 1 when mode=fixed but no fixedPageCount given', async () => {
      const pages = [makePage('p1')]
      mockScannedPages = pages

      vi.mocked(extractExamStructure).mockResolvedValue(makeOcrResult('', ''))
      vi.mocked(groupPagesByFixedCount).mockReturnValue([])

      const { result } = renderHook(() => useClassificationEngine())

      await act(async () => {
        await result.current.startClassification({ mode: 'fixed' })
      })

      expect(groupPagesByFixedCount).toHaveBeenCalledWith(expect.any(Array), 1)
    })
  })
})
