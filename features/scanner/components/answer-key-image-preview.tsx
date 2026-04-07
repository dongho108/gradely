"use client"

import { useEffect, useState, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { fileToImages } from '@/lib/file-utils'

interface AnswerKeyImagePreviewProps {
  file: File
  title: string
  onClose: () => void
}

export function AnswerKeyImagePreview({ file, title, onClose }: AnswerKeyImagePreviewProps) {
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
  }, [])

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError(null)

    fileToImages(file)
      .then((result) => {
        if (!cancelled) {
          setImages(result)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '이미지를 불러올 수 없습니다.')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [file])

  const totalPages = images.length
  const hasMultiplePages = totalPages > 1

  const goToPrev = useCallback(() => {
    setCurrentPage((p) => (p > 0 ? p - 1 : p))
  }, [])

  const goToNext = useCallback(() => {
    setCurrentPage((p) => (p < totalPages - 1 ? p + 1 : p))
  }, [totalPages])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft' && hasMultiplePages) {
        goToPrev()
      } else if (e.key === 'ArrowRight' && hasMultiplePages) {
        goToNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, hasMultiplePages, goToPrev, goToNext])

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-150 ${
        mounted ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={handleBackdropClick}
      data-testid="image-preview-backdrop"
    >
      {/* Title */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
        <span className="bg-black/50 text-white text-sm font-medium px-4 py-1.5 rounded-full drop-shadow-lg truncate max-w-[80vw] block">
          {title}
        </span>
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 transition-colors"
        aria-label="닫기"
        data-testid="image-preview-close"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Content */}
      <div
        className={`transition-transform duration-150 ${
          mounted ? 'scale-100' : 'scale-95'
        }`}
      >
        {loading && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-[400px] h-[560px] bg-gray-700/50 rounded-lg animate-pulse" />
            <span className="text-white/60 text-sm">이미지를 불러오는 중...</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-white/80 text-sm">{error}</p>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white text-sm underline"
            >
              닫기
            </button>
          </div>
        )}

        {!loading && !error && images.length > 0 && (
          <img
            src={images[currentPage]}
            alt={`${title} - ${hasMultiplePages ? `${currentPage + 1}/${totalPages} 페이지` : '미리보기'}`}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl select-none"
            draggable={false}
            data-testid="preview-image"
          />
        )}
      </div>

      {/* PDF page navigation */}
      {hasMultiplePages && !loading && !error && (
        <>
          <button
            onClick={goToPrev}
            disabled={currentPage === 0}
            className="absolute top-1/2 left-4 -translate-y-1/2 bg-black/40 hover:bg-black/60 disabled:opacity-30 disabled:cursor-default text-white rounded-full p-2 transition-colors"
            aria-label="이전 페이지"
            data-testid="prev-page"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={goToNext}
            disabled={currentPage === totalPages - 1}
            className="absolute top-1/2 right-4 -translate-y-1/2 bg-black/40 hover:bg-black/60 disabled:opacity-30 disabled:cursor-default text-white rounded-full p-2 transition-colors"
            aria-label="다음 페이지"
            data-testid="next-page"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-3 py-1 rounded-full">
            {currentPage + 1} / {totalPages}
          </div>
        </>
      )}
    </div>
  )
}
