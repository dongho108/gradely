/**
 * Converts a File (PDF or Image) to an array of base64 image strings.
 * For PDFs, returns one string per page.
 * For Images, returns a single string array.
 */
export async function fileToImages(file: File): Promise<string[]> {
  if (file.type.startsWith('image/')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        resolve([result]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  if (file.type === 'application/pdf') {
    // SSR 환경에서 DOMMatrix 에러를 방지하기 위해 함수 내부에서 동적 import 사용
    const pdfjs = await import('pdfjs-dist');
    
    // CDN 대신 로컬 워커 사용 (Next.js 빌드 환경에서 안정적)
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
    }

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const imageUrls: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (context) {
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        };
        
        await page.render(renderContext).promise;
        imageUrls.push(canvas.toDataURL('image/jpeg', 0.92));
      }
    }

    return imageUrls;
  }

  throw new Error(`Unsupported file type: ${file.type}`);
}

/**
 * Converts multiple Files to a flat array of base64 image strings.
 * Useful for duplex scans where each page is a separate JPEG file.
 */
export async function filesToImages(files: File[]): Promise<string[]> {
  const results = await Promise.all(files.map(fileToImages));
  return results.flat();
}
