/**
 * OpenCV.js (WASM) + sharp 기반의 손글씨 스캔 전처리.
 *
 * 3가지 preset:
 *   - aggressive : 강한 adaptiveThreshold + morphOpen (이진화) — 1차 PoC 디폴트
 *   - gentle     : pre-blur + 큰 blockSize adaptiveThreshold + 작은 morph — 글자 형태 보존
 *   - clahe      : 이진화 없이 CLAHE 대비 향상 + 약한 노이즈 제거 — 회색조 그대로
 *
 * 사용:
 *   await initOpenCV();
 *   const out = await preprocessImage(jpegBuffer, { preset: 'gentle' });
 *
 * 환경변수:
 *   OPENCV_PRESET=aggressive|gentle|clahe  (default: aggressive)
 */

import sharp from 'sharp';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import cvModule from '@techstark/opencv-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cv: any = cvModule;

let opencvReady: Promise<void> | null = null;

export function initOpenCV(): Promise<void> {
  if (opencvReady) return opencvReady;
  opencvReady = new Promise<void>((resolve) => {
    if (cv.Mat) {
      resolve();
      return;
    }
    cv.onRuntimeInitialized = () => resolve();
  });
  return opencvReady;
}

export type Preset = 'aggressive' | 'gentle' | 'clahe';

export interface PreprocessOptions {
  preset?: Preset;
  jpegQuality?: number;
}

export async function preprocessImage(
  jpegBuffer: Buffer,
  opts: PreprocessOptions = {}
): Promise<Buffer> {
  await initOpenCV();

  const preset: Preset = opts.preset ?? (process.env.OPENCV_PRESET as Preset) ?? 'aggressive';
  const jpegQuality = opts.jpegQuality ?? 92;

  // 1. sharp 로 RGBA raw 추출
  const { data, info } = await sharp(jpegBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 2. RGBA Mat 생성 → grayscale
  const src = new cv.Mat(info.height, info.width, cv.CV_8UC4);
  src.data.set(data);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const matsToDelete: any[] = [src, gray];

  let outputMat: any;
  try {
    if (preset === 'aggressive') {
      // === 1차 PoC: 강한 이진화 ===
      const binary = new cv.Mat();
      cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 15, 10);
      const cleaned = new cv.Mat();
      const kernel = cv.Mat.ones(2, 2, cv.CV_8U);
      cv.morphologyEx(binary, cleaned, cv.MORPH_OPEN, kernel);
      matsToDelete.push(binary, kernel);
      outputMat = cleaned;
    } else if (preset === 'gentle') {
      // === gentle: pre-blur + 큰 blockSize + 작은 morph ===
      // Gaussian blur 로 종이 텍스처 매끄럽게
      const blurred = new cv.Mat();
      cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);

      // 큰 blockSize 로 손글씨의 굵은 획 보존, C 약간 높여 가는 노이즈 억제
      const binary = new cv.Mat();
      cv.adaptiveThreshold(blurred, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 12);

      // morph kernel=1 (사실상 영향 없음 — 작은 noise 점만)
      const cleaned = new cv.Mat();
      const kernel = cv.Mat.ones(1, 1, cv.CV_8U);
      cv.morphologyEx(binary, cleaned, cv.MORPH_OPEN, kernel);
      matsToDelete.push(blurred, binary, kernel);
      outputMat = cleaned;
    } else if (preset === 'clahe') {
      // === clahe: 이진화 없이 대비 향상 ===
      // CLAHE 로 종이의 불균일한 배경 보정 + 글자 대비 강화
      const enhanced = new cv.Mat();
      const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8)); // clipLimit=2.0, tileGridSize=8x8
      clahe.apply(gray, enhanced);
      // 가벼운 미디언 블러로 점 노이즈만 제거 (글자 형태는 보존)
      const denoised = new cv.Mat();
      cv.medianBlur(enhanced, denoised, 3);
      matsToDelete.push(enhanced);
      clahe.delete();
      outputMat = denoised;
    } else {
      throw new Error(`Unknown preset: ${preset}`);
    }

    matsToDelete.push(outputMat);

    // 3. Mat → JPEG buffer
    const outData = Buffer.from(outputMat.data);
    const outBuffer = await sharp(outData, {
      raw: { width: outputMat.cols, height: outputMat.rows, channels: 1 },
    })
      .jpeg({ quality: jpegQuality })
      .toBuffer();

    return outBuffer;
  } finally {
    for (const m of matsToDelete) {
      try {
        m.delete();
      } catch {
        // ignore double-delete
      }
    }
  }
}
