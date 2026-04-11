"use client"

import { useState, useCallback, useRef } from 'react'
import { useScanStore } from '@/store/use-scan-store'
import { extractExamStructure, extractExamStructureFromImages } from '@/lib/grading-service'
import { filesToImages } from '@/lib/file-utils'
import { matchExamTitle, groupPagesByStudent, groupPagesByFixedCount } from '@/lib/scan-utils'
import type { ScannedPage, ClassifiedStudent } from '@/types'

type GroupingMode = 'auto' | 'fixed'

interface ClassificationSummary {
  byExamTitle: Record<string, number>  // examTitle → student count
  unclassifiedCount: number
  totalStudents: number
}

interface UseClassificationEngineReturn {
  isClassifying: boolean
  progress: number  // 0-100
  currentPage: number
  totalPages: number
  classificationSummary: ClassificationSummary | null
  startClassification: (options?: { mode?: GroupingMode; fixedPageCount?: number }) => Promise<void>
}

const MAX_CONCURRENT = 5

export function useClassificationEngine(): UseClassificationEngineReturn {
  const [isClassifying, setIsClassifying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [classificationSummary, setClassificationSummary] = useState<ClassificationSummary | null>(null)

  const { updatePageOcrResult, setClassifiedStudents } = useScanStore()

  const startClassification = useCallback(
    async (options?: { mode?: GroupingMode; fixedPageCount?: number }) => {
      const mode = options?.mode ?? 'auto'
      const fixedPageCount = options?.fixedPageCount ?? 1

      const pages = useScanStore.getState().scannedPages
      const keys = useScanStore.getState().answerKeys

      if (pages.length === 0) return

      setIsClassifying(true)
      setProgress(0)
      setCurrentPage(0)
      setTotalPages(pages.length)
      setClassificationSummary(null)

      const queue = [...pages]
      let completedCount = 0
      let activeCount = 0

      await new Promise<void>((resolve) => {
        function processNext() {
          while (activeCount < MAX_CONCURRENT && queue.length > 0) {
            const page = queue.shift()!
            activeCount++

            // 다중 파일(duplex 등)이면 모든 이미지를 합쳐서 OCR
            const ocrPromise = page.files && page.files.length > 1
              ? filesToImages(page.files).then(extractExamStructureFromImages)
              : extractExamStructure(page.file)

            ocrPromise
              .then((ocrResult) => {
                updatePageOcrResult(page.id, ocrResult)
              })
              .catch(() => {
                // Ignore OCR errors for individual pages; page will remain without ocrResult
              })
              .finally(() => {
                activeCount--
                completedCount++
                setCurrentPage(completedCount)
                setProgress(Math.round((completedCount / pages.length) * 100))
                processNext()

                if (completedCount === pages.length) {
                  resolve()
                }
              })
          }
        }

        processNext()
      })

      // All pages processed — get fresh state
      const updatedPages = useScanStore.getState().scannedPages

      let classifiedStudents: ClassifiedStudent[]

      if (mode === 'auto') {
        classifiedStudents = groupPagesByStudent(updatedPages, keys)
      } else {
        const groups = groupPagesByFixedCount(updatedPages, fixedPageCount)
        classifiedStudents = groups.map((group, index) => {
          const firstPage = group[0]
          const ocrResult = firstPage?.ocrResult
          const examTitle = ocrResult?.examTitle ?? ''
          const matchedKey = examTitle ? matchExamTitle(examTitle, keys) : null

          return {
            name: ocrResult?.studentName ?? `Student ${index + 1}`,
            className: ocrResult?.className,
            examTitle,
            pages: group,
            answerKeyId: matchedKey?.id ?? '',
          }
        })
      }

      setClassifiedStudents(classifiedStudents)

      // Compute summary
      const byExamTitle: Record<string, number> = {}
      let unclassifiedCount = 0

      for (const student of classifiedStudents) {
        if (!student.name || !student.examTitle) {
          unclassifiedCount++
          continue
        }
        byExamTitle[student.examTitle] = (byExamTitle[student.examTitle] ?? 0) + 1
      }

      setClassificationSummary({
        byExamTitle,
        unclassifiedCount,
        totalStudents: classifiedStudents.length,
      })

      setIsClassifying(false)
    },
    [updatePageOcrResult, setClassifiedStudents],
  )

  return {
    isClassifying,
    progress,
    currentPage,
    totalPages,
    classificationSummary,
    startClassification,
  }
}
