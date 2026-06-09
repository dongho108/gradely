import { preprocessCanvas } from './image-preprocess';

/**
 * Converts a File (PDF or Image) to an array of base64 image strings.
 * 두 분기 모두 canvas 를 거쳐 OpenCV gentle preset 전처리(`preprocessCanvas`)를 적용한 후 JPEG data URL을 반환한다.
 */
export async function fileToImages(file: File): Promise<string[]> {
  if (file.type.startsWith('image/')) {
    return [await imageFileToProcessedDataUrl(file)];
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
        await preprocessCanvas(canvas);
        imageUrls.push(canvas.toDataURL('image/jpeg', 0.92));
      }
    }

    return imageUrls;
  }

  throw new Error(`Unsupported file type: ${file.type}`);
}

/**
 * 이미지 File 을 canvas 로 디코딩 → OpenCV 전처리 → JPEG data URL 로 인코딩한다.
 * createImageBitmap 우선 사용, 미지원 환경(구형 브라우저)에서는 HTMLImageElement 로 fallback.
 */
async function imageFileToProcessedDataUrl(file: File): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
  } else {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error(`Failed to decode image: ${file.name}`));
        el.src = url;
      });
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  await preprocessCanvas(canvas);
  return canvas.toDataURL('image/jpeg', 0.92);
}

/**
 * Converts multiple Files to a flat array of base64 image strings.
 * Useful for duplex scans where each page is a separate JPEG file.
 */
export async function filesToImages(files: File[]): Promise<string[]> {
  const results = await Promise.all(files.map(fileToImages));
  return results.flat();
}
