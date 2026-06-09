/**
 * Browser용 OpenCV.js gentle preset 전처리.
 *
 * Algorithm (Node 진단 스크립트 scripts/reports/preprocess-opencv.ts:60-75 와 동일):
 *   1. RGBA → grayscale (cvtColor)
 *   2. GaussianBlur 3x3 — 종이 텍스처 매끄럽게
 *   3. adaptiveThreshold(blockSize=31, C=12) — 굵은 손글씨 획 보존
 *   4. morphologyEx OPEN (kernel=1) — 작은 점 노이즈 제거
 *
 * OpenCV.js 는 ~9MB 크기에 Node `fs` 모듈을 require 하는 universal 빌드라 Turbopack/Webpack
 * 둘 다 파싱에 실패한다. 따라서 NPM import 대신 `<script src="/opencv/opencv.js">` 로
 * 런타임 로드한다. scripts/copy-opencv.mjs 가 build 시 node_modules → public/ 로 복사한다.
 *
 * 초기화 / 처리 실패 시 원본 canvas 를 그대로 반환해 사용자 채점 흐름을 막지 않는다
 * (graceful degradation).
 */

const OPENCV_SCRIPT_URL = '/opencv/opencv.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cv = any;

let opencvReady: Promise<Cv> | null = null;

function loadOpenCV(): Promise<Cv> {
  if (opencvReady) return opencvReady;

  opencvReady = new Promise<Cv>((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('OpenCV: browser environment required'));
      return;
    }

    // 테스트 등으로 이미 globalThis.cv 가 주입돼 있으면 그대로 사용
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing: Cv | undefined = (globalThis as any).cv;
    if (existing) {
      if (existing.Mat) {
        resolve(existing);
        return;
      }
      existing.onRuntimeInitialized = () => resolve(existing);
      return;
    }

    // <script> 태그 한 번만 주입 — 이미 있으면 load 이벤트만 다시 기다린다
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${OPENCV_SCRIPT_URL}"]`
    );
    const script: HTMLScriptElement = existingScript ?? document.createElement('script');

    const onLoad = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cv: Cv | undefined = (globalThis as any).cv;
      if (!cv) {
        reject(new Error('OpenCV: script loaded but globalThis.cv missing'));
        return;
      }
      if (cv.Mat) {
        resolve(cv);
      } else {
        cv.onRuntimeInitialized = () => resolve(cv);
      }
    };
    const onError = () => reject(new Error(`OpenCV: failed to load ${OPENCV_SCRIPT_URL}`));

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });

    if (!existingScript) {
      script.src = OPENCV_SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return opencvReady;
}

/** OpenCV.js lazy init. 채점 화면 진입 시 호출하면 사용자가 업로드할 때까지 백그라운드로 준비됨. */
export async function initOpenCV(): Promise<void> {
  await loadOpenCV();
}

/**
 * gentle preset 으로 canvas 픽셀을 갱신해 반환한다.
 * 실패 시 원본 canvas 를 그대로 돌려준다 (console.warn 로깅).
 */
export async function preprocessCanvas(canvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  if (typeof document === 'undefined') return canvas;

  let cv: Cv;
  try {
    cv = await loadOpenCV();
  } catch (err) {
    console.warn('[image-preprocess] OpenCV.js 로드 실패, 원본 사용:', err);
    return canvas;
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  // 처리 중 메모리 누수 방지 — finally 에서 모두 delete
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mats: any[] = [];
  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const src = cv.matFromImageData(imageData);
    mats.push(src);

    const gray = new cv.Mat();
    mats.push(gray);
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const blurred = new cv.Mat();
    mats.push(blurred);
    cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);

    const binary = new cv.Mat();
    mats.push(binary);
    cv.adaptiveThreshold(
      blurred,
      binary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      31,
      12
    );

    const cleaned = new cv.Mat();
    mats.push(cleaned);
    const kernel = cv.Mat.ones(1, 1, cv.CV_8U);
    mats.push(kernel);
    cv.morphologyEx(binary, cleaned, cv.MORPH_OPEN, kernel);

    cv.imshow(canvas, cleaned);
    return canvas;
  } catch (err) {
    console.warn('[image-preprocess] 전처리 실패, 원본 사용:', err);
    return canvas;
  } finally {
    for (const m of mats) {
      try {
        m.delete();
      } catch {
        // ignore double-delete
      }
    }
  }
}

/** 테스트 전용: 초기화 캐시를 비운다. */
export function __resetForTest(): void {
  opencvReady = null;
}
