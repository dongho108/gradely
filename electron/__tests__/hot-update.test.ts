// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PassThrough } from 'stream';

// ---------- module-level mocks ----------

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/tmp/test-userdata';
      return '/tmp';
    }),
  },
  net: {
    fetch: vi.fn(),
  },
}));

vi.mock('unzipper', () => ({
  default: {
    Extract: vi.fn(() => new PassThrough()),
  },
  Extract: vi.fn(() => new PassThrough()),
}));

// ---------- imports (after mocks) ----------

import { app, net } from 'electron';
import {
  fetchManifest,
  needsUpdate,
  downloadAndExtract,
  getOutDir,
  checkForUIUpdate,
  type UIManifest,
} from '../hot-update';

// ---------- helpers ----------

const CACHE_DIR = path.join('/tmp/test-userdata', 'ui-cache');
const VERSION_FILE = path.join(CACHE_DIR, 'version.json');
const CACHED_OUT_DIR = path.join(CACHE_DIR, 'out');

function makeManifest(overrides: Partial<UIManifest> = {}): UIManifest {
  return {
    version: 'abc123def456',
    url: 'https://github.com/dongho108/ai-exam-grader/releases/download/ui-latest/ui-bundle.zip',
    size: 1024,
    ...overrides,
  };
}

/** Helper: make net.fetch resolve with a JSON response */
function mockFetchJson(body: unknown, ok = true) {
  (net.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
    body: null,
  });
}

/** Helper: make net.fetch resolve with an arrayBuffer response (for zip download) */
function mockFetchArrayBuffer(ok = true) {
  const fakeZipBuffer = Buffer.from('PK-fake-zip-data');
  (net.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    arrayBuffer: () => Promise.resolve(fakeZipBuffer.buffer.slice(
      fakeZipBuffer.byteOffset,
      fakeZipBuffer.byteOffset + fakeZipBuffer.byteLength,
    )),
  });
}

// ---------- test suites ----------

describe('hot-update 모듈', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  // ----------------------------------------------------------------
  // fetchManifest
  // ----------------------------------------------------------------
  describe('fetchManifest', () => {
    it('정상 응답 시 UIManifest 객체를 반환한다', async () => {
      const expected = makeManifest();
      mockFetchJson(expected);

      const result = await fetchManifest();

      expect(result).toEqual(expected);
      expect(net.fetch).toHaveBeenCalledWith(
        expect.stringContaining('ui-manifest.json'),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('네트워크 실패 시 null을 반환하고 에러를 throw하지 않는다', async () => {
      (net.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('network error'),
      );

      const result = await fetchManifest();

      expect(result).toBeNull();
    });

    it('HTTP 오류 응답(non-ok) 시 null을 반환한다', async () => {
      mockFetchJson({}, false);

      const result = await fetchManifest();

      expect(result).toBeNull();
    });
  });

  // ----------------------------------------------------------------
  // needsUpdate
  // ----------------------------------------------------------------
  describe('needsUpdate', () => {
    it('로컬 버전 파일이 없으면 true를 반환한다', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = needsUpdate(makeManifest());

      expect(result).toBe(true);
    });

    it('로컬 버전과 원격 버전이 다르면 true를 반환한다', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ version: 'old-version-hash' }),
      );

      const result = needsUpdate(makeManifest({ version: 'new-version-hash' }));

      expect(result).toBe(true);
    });

    it('로컬 버전과 원격 버전이 같으면 false를 반환한다', () => {
      const version = 'same-version-hash';
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ version }),
      );

      const result = needsUpdate(makeManifest({ version }));

      expect(result).toBe(false);
    });

    it('버전 파일 읽기 실패 시 true를 반환한다', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('read error');
      });

      const result = needsUpdate(makeManifest());

      expect(result).toBe(true);
    });
  });

  // ----------------------------------------------------------------
  // getOutDir
  // ----------------------------------------------------------------
  describe('getOutDir', () => {
    it('캐시된 out/ 디렉토리가 존재하면 캐시 경로를 반환한다', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        if (String(p) === CACHED_OUT_DIR) return true;
        return false;
      });

      const result = getOutDir();

      expect(result).toBe(CACHED_OUT_DIR);
    });

    it('캐시가 없으면 번들(fallback) 경로를 반환한다', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = getOutDir();

      // 번들 경로는 __dirname/../out 기반이므로 'out'으로 끝나야 함
      expect(result).toMatch(/out$/);
      expect(result).not.toBe(CACHED_OUT_DIR);
    });
  });

  // ----------------------------------------------------------------
  // downloadAndExtract
  // ----------------------------------------------------------------
  describe('downloadAndExtract', () => {
    it('성공 시 true를 반환하고 version.json을 저장한다', async () => {
      const manifest = makeManifest();
      mockFetchArrayBuffer(true);

      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
      const writeFileSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'renameSync').mockReturnValue(undefined);
      vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined);
      vi.spyOn(fs, 'rmSync').mockReturnValue(undefined);

      const result = await downloadAndExtract(manifest);

      expect(result).toBe(true);
      // version.json이 저장되어야 한다
      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringContaining('version.json'),
        expect.stringContaining(manifest.version),
      );
    });

    it('다운로드 실패 시 false를 반환한다', async () => {
      const manifest = makeManifest();
      (net.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('download failed'),
      );

      vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = await downloadAndExtract(manifest);

      expect(result).toBe(false);
    });

    it('HTTP 오류 응답 시 false를 반환한다', async () => {
      const manifest = makeManifest();
      mockFetchArrayBuffer(false);

      vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = await downloadAndExtract(manifest);

      expect(result).toBe(false);
    });
  });

  // ----------------------------------------------------------------
  // checkForUIUpdate (통합 흐름)
  // ----------------------------------------------------------------
  describe('checkForUIUpdate', () => {
    it('manifest fetch → needsUpdate true → downloadAndExtract 전체 흐름을 수행한다', async () => {
      const manifest = makeManifest({ version: 'new-remote-version' });

      // 1) fetchManifest: 정상 manifest 반환
      mockFetchJson(manifest);

      // 2) needsUpdate: 로컬 버전 파일 없음 → true
      const existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      // 3) downloadAndExtract 관련 mock
      vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
      vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
      vi.spyOn(fs, 'renameSync').mockReturnValue(undefined);
      vi.spyOn(fs, 'unlinkSync').mockReturnValue(undefined);
      vi.spyOn(fs, 'rmSync').mockReturnValue(undefined);

      const fakeZipBuffer = Buffer.from('PK-fake-zip-data');

      // net.fetch는 첫 호출에서 manifest JSON, 두 번째 호출에서 arrayBuffer 반환
      (net.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(manifest),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          arrayBuffer: () => Promise.resolve(fakeZipBuffer.buffer.slice(
            fakeZipBuffer.byteOffset,
            fakeZipBuffer.byteOffset + fakeZipBuffer.byteLength,
          )),
        });

      // 에러 없이 완료되어야 한다
      await expect(checkForUIUpdate()).resolves.not.toThrow();

      // net.fetch가 최소 1번 호출되어야 한다 (manifest 가져오기)
      expect(net.fetch).toHaveBeenCalled();
    });

    it('manifest가 null이면 다운로드를 시도하지 않는다', async () => {
      (net.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('network error'),
      );

      await expect(checkForUIUpdate()).resolves.not.toThrow();

      // fetch는 manifest 요청에서 1번만 호출
      expect(net.fetch).toHaveBeenCalledTimes(1);
    });

    it('업데이트가 필요 없으면 다운로드를 건너뛴다', async () => {
      const version = 'same-version';
      const manifest = makeManifest({ version });

      mockFetchJson(manifest);

      // needsUpdate가 false를 반환하도록 설정
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ version }),
      );

      await expect(checkForUIUpdate()).resolves.not.toThrow();

      // manifest fetch 1번만 호출, 다운로드는 안 함
      expect(net.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
