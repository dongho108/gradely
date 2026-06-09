import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock image-preprocess: identity passthrough but count calls
const preprocessCanvasMock = vi.fn(async (c: HTMLCanvasElement) => c);
vi.mock('../image-preprocess', () => ({
  preprocessCanvas: (c: HTMLCanvasElement) => preprocessCanvasMock(c),
}));

// Mock pdfjs-dist for PDF branch
interface FakePdf {
  numPages: number;
}
const renderPromise = vi.fn(() => Promise.resolve());
const fakePage = {
  getViewport: vi.fn(() => ({ width: 100, height: 100 })),
  render: vi.fn(() => ({ promise: renderPromise() })),
};
const getDocumentMock = vi.fn((..._args: unknown[]) => ({
  promise: Promise.resolve({
    numPages: 2,
    getPage: vi.fn(async (_n: number) => fakePage),
  } as FakePdf & { getPage: unknown }),
}));
vi.mock('pdfjs-dist', () => ({
  getDocument: (...args: unknown[]) => getDocumentMock(...args),
  GlobalWorkerOptions: { workerSrc: '' },
}));

// === canvas stub ===
// jsdom 의 HTMLCanvasElement.toDataURL 은 환경에 따라 동작이 다르므로 우리 통제 하에 둔다.
function stubCanvasFactory() {
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = origCreate(tag) as HTMLElement;
    if (tag === 'canvas') {
      const canvas = el as HTMLCanvasElement;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (canvas as any).getContext = vi.fn().mockReturnValue({
        getImageData: vi.fn(),
        drawImage: vi.fn(),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (canvas as any).toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,STUB');
    }
    return el;
  });
}

beforeEach(() => {
  preprocessCanvasMock.mockClear();
  getDocumentMock.mockClear();
  fakePage.render.mockClear();
  stubCanvasFactory();

  // createImageBitmap stub (jsdom 에 없음)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue({
    width: 50,
    height: 50,
    close: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).createImageBitmap;
});

// Import 은 mock 들이 등록된 이후
import { fileToImages, filesToImages } from '../file-utils';

describe('fileToImages — image branch', () => {
  it('JPEG 파일을 처리해 1개의 data URL 을 반환하고 preprocessCanvas 가 1회 호출된다', async () => {
    const file = new File(['fake'], 'a.jpg', { type: 'image/jpeg' });
    const urls = await fileToImages(file);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/^data:image\/jpeg/);
    expect(preprocessCanvasMock).toHaveBeenCalledTimes(1);
  });

  it('PNG 파일도 동일하게 canvas 경유 + preprocess 적용', async () => {
    const file = new File(['fake'], 'a.png', { type: 'image/png' });
    const urls = await fileToImages(file);

    expect(urls).toHaveLength(1);
    expect(preprocessCanvasMock).toHaveBeenCalledTimes(1);
  });
});

describe('fileToImages — PDF branch', () => {
  it('PDF 각 페이지마다 preprocessCanvas 가 호출되고 페이지 수만큼 data URL 을 반환', async () => {
    const file = new File(['fake'], 'a.pdf', { type: 'application/pdf' });
    const urls = await fileToImages(file);

    expect(urls).toHaveLength(2); // numPages = 2
    expect(preprocessCanvasMock).toHaveBeenCalledTimes(2);
    expect(fakePage.render).toHaveBeenCalledTimes(2);
  });
});

describe('fileToImages — unsupported', () => {
  it('지원하지 않는 MIME 타입은 throw 한다', async () => {
    const file = new File(['fake'], 'a.txt', { type: 'text/plain' });
    await expect(fileToImages(file)).rejects.toThrow(/Unsupported file type/);
    expect(preprocessCanvasMock).not.toHaveBeenCalled();
  });
});

describe('filesToImages', () => {
  it('여러 파일을 flat-map 으로 처리한다 (이미지 2개 → 결과 2개, preprocess 2회)', async () => {
    const f1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const f2 = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
    const urls = await filesToImages([f1, f2]);

    expect(urls).toHaveLength(2);
    expect(preprocessCanvasMock).toHaveBeenCalledTimes(2);
  });
});
