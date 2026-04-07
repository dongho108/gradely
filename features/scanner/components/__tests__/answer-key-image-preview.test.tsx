import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AnswerKeyImagePreview } from '../answer-key-image-preview'

// Mock fileToImages
vi.mock('@/lib/file-utils', () => ({
  fileToImages: vi.fn(),
}))

import { fileToImages } from '@/lib/file-utils'

const mockFileToImages = vi.mocked(fileToImages)

function createMockFile(name = 'test.png', type = 'image/png') {
  return new File(['fake-content'], name, { type })
}

describe('AnswerKeyImagePreview', () => {
  const defaultProps = {
    file: createMockFile(),
    title: '테스트 정답지',
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    defaultProps.onClose = vi.fn()
  })

  it('shows loading state initially', () => {
    mockFileToImages.mockReturnValue(new Promise(() => {})) // never resolves

    render(<AnswerKeyImagePreview {...defaultProps} />)

    expect(screen.getByText('이미지를 불러오는 중...')).toBeInTheDocument()
  })

  it('displays image after loading', async () => {
    mockFileToImages.mockResolvedValue(['data:image/png;base64,abc123'])

    render(<AnswerKeyImagePreview {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByTestId('preview-image')).toBeInTheDocument()
    })

    const img = screen.getByTestId('preview-image') as HTMLImageElement
    expect(img.src).toBe('data:image/png;base64,abc123')
  })

  it('shows title in the modal', async () => {
    mockFileToImages.mockResolvedValue(['data:image/png;base64,abc123'])

    render(<AnswerKeyImagePreview {...defaultProps} />)

    expect(screen.getByText('테스트 정답지')).toBeInTheDocument()
  })

  it('shows page navigation for multi-page PDFs', async () => {
    mockFileToImages.mockResolvedValue([
      'data:image/jpeg;base64,page1',
      'data:image/jpeg;base64,page2',
      'data:image/jpeg;base64,page3',
    ])

    render(<AnswerKeyImagePreview {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByTestId('preview-image')).toBeInTheDocument()
    })

    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByTestId('prev-page')).toBeInTheDocument()
    expect(screen.getByTestId('next-page')).toBeInTheDocument()
  })

  it('navigates pages with arrow buttons', async () => {
    mockFileToImages.mockResolvedValue([
      'data:image/jpeg;base64,page1',
      'data:image/jpeg;base64,page2',
    ])

    render(<AnswerKeyImagePreview {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByTestId('preview-image')).toBeInTheDocument()
    })

    expect(screen.getByText('1 / 2')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('next-page'))
    expect(screen.getByText('2 / 2')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('prev-page'))
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('calls onClose when Escape key is pressed', async () => {
    mockFileToImages.mockResolvedValue(['data:image/png;base64,abc123'])

    render(<AnswerKeyImagePreview {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByTestId('preview-image')).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on backdrop click', async () => {
    mockFileToImages.mockResolvedValue(['data:image/png;base64,abc123'])

    render(<AnswerKeyImagePreview {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByTestId('preview-image')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('image-preview-backdrop'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when close button is clicked', async () => {
    mockFileToImages.mockResolvedValue(['data:image/png;base64,abc123'])

    render(<AnswerKeyImagePreview {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByTestId('preview-image')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('image-preview-close'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('shows error message when fileToImages fails', async () => {
    mockFileToImages.mockRejectedValue(new Error('Unsupported file type'))

    render(<AnswerKeyImagePreview {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Unsupported file type')).toBeInTheDocument()
    })
  })

  it('navigates pages with keyboard arrows', async () => {
    mockFileToImages.mockResolvedValue([
      'data:image/jpeg;base64,page1',
      'data:image/jpeg;base64,page2',
    ])

    render(<AnswerKeyImagePreview {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByTestId('preview-image')).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('2 / 2')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('does not show navigation for single image', async () => {
    mockFileToImages.mockResolvedValue(['data:image/png;base64,abc123'])

    render(<AnswerKeyImagePreview {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByTestId('preview-image')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('prev-page')).not.toBeInTheDocument()
    expect(screen.queryByTestId('next-page')).not.toBeInTheDocument()
  })
})
