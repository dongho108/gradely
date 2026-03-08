"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { QuestionResult } from '@/types/grading';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

interface PDFViewerProps {
  file: File | string;
  className?: string;
}

export function PDFViewer({ file, className }: PDFViewerProps) {
  useEffect(() => {
    // Configure PDF worker client-side only
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    
    // Check if file is an image
    if (file instanceof File) {
      if (file.type.startsWith('image/')) {
        setIsImage(true);
        const url = URL.createObjectURL(file);
        setImageUrl(url);
        setNumPages(1);
        setPageNumber(1);
        return () => URL.revokeObjectURL(url);
      } else {
        setIsImage(false);
        setImageUrl(null);
      }
    } else if (typeof file === 'string' && (file.startsWith('data:image/') || file.match(/\.(jpg|jpeg|png|webp)$/i))) {
      setIsImage(true);
      setImageUrl(file);
      setNumPages(1);
      setPageNumber(1);
    } else {
      setIsImage(false);
      setImageUrl(null);
    }
  }, [file]);

  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [isImage, setIsImage] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setImgSize({ width: naturalWidth, height: naturalHeight });
    setLoading(false);
  };

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
  }

  return (
    <div className={cn("flex flex-col h-full bg-gray-100/50 rounded-xl overflow-hidden border border-gray-200", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shadow-sm shrink-0 z-10">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPageNumber(p => Math.max(1, p - 1))}
            disabled={pageNumber <= 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums text-gray-600">
            Page {pageNumber} of {numPages || '--'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
            disabled={pageNumber >= numPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.max(0.5, s - 0.1))}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs font-medium w-12 text-center text-gray-500">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.min(2.5, s + 0.1))}>
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Document Container */}
      <div className="flex-1 overflow-auto p-8 flex justify-center bg-gray-100/50">
        {isImage ? (
          <div 
            className="relative bg-white shadow-xl transition-all duration-200"
            style={{ 
              width: imgSize ? imgSize.width * scale : 'auto',
              maxHeight: 'none'
            }}
          >
            {imageUrl && (
              <img 
                src={imageUrl} 
                alt="Exam Paper" 
                className="w-full h-auto block"
                onLoad={handleImageLoad}
              />
            )}
            
          </div>
        ) : (
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex items-center gap-2 text-primary font-medium animate-pulse">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading PDF...
              </div>
            }
            className="shadow-xl"
          >
            <div
              className="relative"
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                className="bg-white shadow-sm"
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />

            </div>
          </Document>
        )}
      </div>
    </div>
  );
}
