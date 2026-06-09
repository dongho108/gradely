import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mat-like 객체: delete() spy 포함. 매 생성마다 새 객체.
const createdMats: Array<{ delete: ReturnType<typeof vi.fn> }> = [];
function newMat() {
  const m = { delete: vi.fn() };
  createdMats.push(m);
  return m;
}

const Mat = vi.fn(newMat) as unknown as {
  (this: unknown, ...args: unknown[]): unknown;
  ones: ReturnType<typeof vi.fn>;
};
Mat.ones = vi.fn(newMat);

const cvMock = {
  Mat,
  matFromImageData: vi.fn(newMat),
  cvtColor: vi.fn(),
  GaussianBlur: vi.fn(),
  adaptiveThreshold: vi.fn(),
  morphologyEx: vi.fn(),
  imshow: vi.fn(),
  // `new cv.Size(...)` 로 호출 — arrow function 이면 안 됨
  Size: vi.fn(function SizeImpl(w: number, h: number) {
    return { w, h };
  }),
  COLOR_RGBA2GRAY: 11,
  BORDER_DEFAULT: 4,
  ADAPTIVE_THRESH_GAUSSIAN_C: 1,
  THRESH_BINARY: 0,
  MORPH_OPEN: 2,
  CV_8U: 0,
  onRuntimeInitialized: undefined as (() => void) | undefined,
};

import { preprocessCanvas, initOpenCV, __resetForTest } from '../image-preprocess';

function makeFakeCanvas(width = 100, height = 100): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const fakeCtx = {
    getImageData: vi.fn().mockImplementation((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
      colorSpace: 'srgb',
    })),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (canvas as any).getContext = vi.fn().mockReturnValue(fakeCtx);
  return canvas;
}

beforeEach(() => {
  __resetForTest();
  createdMats.length = 0;
  cvMock.matFromImageData.mockClear();
  cvMock.cvtColor.mockClear();
  cvMock.GaussianBlur.mockClear();
  cvMock.adaptiveThreshold.mockClear();
  cvMock.morphologyEx.mockClear();
  cvMock.imshow.mockClear();
  (Mat as unknown as { mockClear: () => void }).mockClear();
  Mat.ones.mockClear();
  cvMock.matFromImageData.mockImplementation(newMat);
  (Mat as unknown as { mockImplementation: (fn: () => unknown) => void }).mockImplementation(newMat);
  Mat.ones.mockImplementation(newMat);

  // loadOpenCV() 가 즉시 사용할 수 있도록 globalThis.cv 주입 (Mat 이 truthy 라 init 대기 없이 resolve)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).cv = cvMock;
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).cv;
});

describe('initOpenCV', () => {
  it('정상 환경에서 throw 없이 완료된다', async () => {
    await expect(initOpenCV()).resolves.toBeUndefined();
  });

  it('여러 번 호출해도 에러 없이 통과 (캐시 동작)', async () => {
    await initOpenCV();
    await initOpenCV();
    await initOpenCV();
  });
});

describe('preprocessCanvas', () => {
  it('OpenCV 파이프라인을 올바른 순서·파라미터로 호출한다', async () => {
    const canvas = makeFakeCanvas(200, 100);
    const result = await preprocessCanvas(canvas);

    expect(result).toBe(canvas);
    expect(cvMock.matFromImageData).toHaveBeenCalledTimes(1);
    expect(cvMock.cvtColor).toHaveBeenCalledTimes(1);
    expect(cvMock.GaussianBlur).toHaveBeenCalledTimes(1);
    expect(cvMock.adaptiveThreshold).toHaveBeenCalledTimes(1);

    // adaptiveThreshold 의 blockSize=31, C=12 (gentle preset 핵심 파라미터)
    const atArgs = cvMock.adaptiveThreshold.mock.calls[0];
    expect(atArgs[2]).toBe(255);
    expect(atArgs[5]).toBe(31);
    expect(atArgs[6]).toBe(12);

    expect(cvMock.morphologyEx).toHaveBeenCalledTimes(1);
    expect(cvMock.imshow).toHaveBeenCalledTimes(1);
    expect(cvMock.imshow.mock.calls[0][0]).toBe(canvas);
  });

  it('canvas 크기는 변경되지 않는다', async () => {
    const canvas = makeFakeCanvas(640, 480);
    await preprocessCanvas(canvas);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
  });

  it('생성한 모든 Mat 은 delete() 로 해제된다 (메모리 누수 방지)', async () => {
    await preprocessCanvas(makeFakeCanvas());

    expect(createdMats.length).toBeGreaterThanOrEqual(6);
    for (const m of createdMats) {
      expect(m.delete).toHaveBeenCalled();
    }
  });

  it('canvas.getContext 가 null 이면 원본 canvas 를 반환', async () => {
    const canvas = document.createElement('canvas');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (canvas as any).getContext = vi.fn().mockReturnValue(null);
    const result = await preprocessCanvas(canvas);
    expect(result).toBe(canvas);
    expect(cvMock.matFromImageData).not.toHaveBeenCalled();
  });

  it('OpenCV 처리 중 throw 발생 시 원본 canvas 를 반환 (graceful fallback)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cvMock.adaptiveThreshold.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const canvas = makeFakeCanvas();
    const result = await preprocessCanvas(canvas);

    expect(result).toBe(canvas);
    expect(warn).toHaveBeenCalled();
    for (const m of createdMats) {
      expect(m.delete).toHaveBeenCalled();
    }
    warn.mockRestore();
  });

  it('OpenCV 로드 자체가 실패하면 원본 canvas 반환', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    __resetForTest();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).cv;
    // jsdom 의 script 태그가 즉시 load 이벤트를 발생시키지 않으므로, 실패 경로를
    // 시뮬레이션하기 위해 document.head.appendChild 를 가로채 비동기 error 발사
    const origAppend = document.head.appendChild.bind(document.head);
    const spy = vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T) => {
      origAppend(node);
      queueMicrotask(() => {
        if (node instanceof HTMLScriptElement) {
          node.dispatchEvent(new Event('error'));
        }
      });
      return node;
    });

    const canvas = makeFakeCanvas();
    const result = await preprocessCanvas(canvas);
    expect(result).toBe(canvas);
    expect(warn).toHaveBeenCalled();

    spy.mockRestore();
    warn.mockRestore();
  });
});
