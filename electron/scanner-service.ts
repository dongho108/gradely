import { app } from 'electron';
import { execFile, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const VALID_DPI_RANGE = { min: 75, max: 1200 };
const VALID_COLOR_MODES = ['color', 'gray', 'bw'] as const;
const VALID_SOURCES = ['glass', 'feeder', 'duplex'] as const;
const VALID_FORMATS = ['pdf', 'jpeg', 'png'] as const;

const FORMAT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

interface ScanOptions {
  device?: string;
  dpi?: number;
  colorMode?: typeof VALID_COLOR_MODES[number];
  format?: typeof VALID_FORMATS[number];
  source?: typeof VALID_SOURCES[number];
}

interface ScanResult {
  filePath: string;
  mimeType: string;
}

interface ScannerDevice {
  name: string;
  driver: 'twain' | 'wia';
}

interface ScannerAvailability {
  available: boolean;
  reason?: 'windows-only' | 'naps2-not-found';
  path?: string;
}

export class ScannerService {
  private cachedNaps2Path: string | null = null;
  private isScanning = false;
  private currentProcess: ChildProcess | null = null;

  private get tempDir(): string {
    return path.join(app.getPath('temp'), 'ai-exam-grader-scan');
  }

  /**
   * NAPS2 데이터 디렉토리 경로를 반환한다.
   * Program Files 내에서는 쓰기가 불가하므로 userData 디렉토리를 사용한다.
   */
  private get naps2DataDir(): string {
    return path.join(app.getPath('userData'), 'naps2-data');
  }

  /**
   * NAPS2 Console 실행 파일 경로를 탐색한다.
   * Program Files 내에 있는지 검증하여 보안을 확보한다.
   */
  findNaps2Path(): string | null {
    if (this.cachedNaps2Path) {
      console.log('[Scanner] findNaps2Path: 캐시된 경로 반환:', this.cachedNaps2Path);
      return this.cachedNaps2Path;
    }

    console.log('[Scanner] findNaps2Path: 경로 탐색 시작');
    console.log('[Scanner] findNaps2Path: resourcesPath =', process.resourcesPath);
    console.log('[Scanner] findNaps2Path: appPath =', app.getAppPath());

    const candidates = [
      path.join(process.resourcesPath, 'naps2', 'App', 'NAPS2.Console.exe'),
      path.join(app.getAppPath(), 'resources', 'naps2', 'App', 'NAPS2.Console.exe'),
      path.join('C:', 'Program Files', 'NAPS2', 'NAPS2.Console.exe'),
      path.join('C:', 'Program Files (x86)', 'NAPS2', 'NAPS2.Console.exe'),
    ];

    const trustedPrefixes = [
      process.resourcesPath,
      path.join(app.getAppPath(), 'resources'),
      'C:\\Program Files\\',
      'C:\\Program Files (x86)\\',
    ];

    for (const candidate of candidates) {
      try {
        const normalized = path.normalize(candidate);
        const isTrusted = trustedPrefixes.some(prefix =>
          normalized.startsWith(path.normalize(prefix))
        );
        if (!isTrusted) {
          console.log('[Scanner] findNaps2Path: 신뢰할 수 없는 경로 건너뜀:', normalized);
          continue;
        }
        fs.accessSync(normalized, fs.constants.X_OK);
        console.log('[Scanner] findNaps2Path: 발견! 경로:', normalized);
        this.cachedNaps2Path = normalized;
        return normalized;
      } catch (err) {
        console.log('[Scanner] findNaps2Path: 후보 실패:', candidate, '→', (err as Error).message);
      }
    }

    console.warn('[Scanner] findNaps2Path: 모든 후보 경로에서 NAPS2를 찾지 못함');
    return null;
  }

  /**
   * NAPS2 사용 가능 여부를 확인한다.
   */
  isAvailable(): ScannerAvailability {
    console.log('[Scanner] isAvailable: 플랫폼 =', process.platform);
    if (process.platform !== 'win32') {
      console.warn('[Scanner] isAvailable: Windows가 아님 → available: false');
      return { available: false, reason: 'windows-only' };
    }

    const naps2Path = this.findNaps2Path();
    if (!naps2Path) {
      console.warn('[Scanner] isAvailable: NAPS2를 찾지 못함 → available: false');
      return { available: false, reason: 'naps2-not-found' };
    }

    console.log('[Scanner] isAvailable: 사용 가능! NAPS2 경로:', naps2Path);
    return { available: true, path: naps2Path };
  }

  /**
   * 연결된 스캐너 목록을 반환한다.
   */
  listDevices(): Promise<ScannerDevice[]> {
    return new Promise((resolve, reject) => {
      const naps2Path = this.findNaps2Path();
      if (!naps2Path) {
        console.error('[Scanner] listDevices: NAPS2 경로 없음');
        return reject(new Error('NAPS2 not found'));
      }

      const args = ['--listdevices', '--driver', 'twain', '--naps2data', this.naps2DataDir];
      console.log('[Scanner] listDevices: 실행:', naps2Path, args.join(' '));

      execFile(naps2Path, args, { timeout: 10000 }, (error, stdout, stderr) => {
        if (error) {
          console.error('[Scanner] listDevices: 에러:', error.message);
          console.error('[Scanner] listDevices: stderr:', stderr);
          console.error('[Scanner] listDevices: killed:', error.killed);
          return reject(new Error(`Failed to list devices: ${stderr || error.message}`));
        }

        console.log('[Scanner] listDevices: stdout 원문:', JSON.stringify(stdout));
        console.log('[Scanner] listDevices: stderr:', JSON.stringify(stderr));

        const devices: ScannerDevice[] = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((name) => ({ name, driver: 'twain' as const }));

        console.log('[Scanner] listDevices: 파싱된 디바이스 목록:', JSON.stringify(devices));
        resolve(devices);
      });
    });
  }

  /**
   * 스캔을 실행하고 임시 파일 경로를 반환한다.
   */
  async scan(options: ScanOptions = {}): Promise<ScanResult> {
    console.log('[Scanner] scan: 호출됨, 옵션:', JSON.stringify(options));

    if (this.isScanning) {
      console.warn('[Scanner] scan: 이미 스캔 진행 중');
      throw new Error('A scan is already in progress');
    }

    const naps2Path = this.findNaps2Path();
    if (!naps2Path) {
      console.error('[Scanner] scan: NAPS2 경로 없음');
      throw new Error('NAPS2 not found');
    }

    // 옵션 검증
    const dpi = options.dpi ?? 300;
    if (!Number.isInteger(dpi) || dpi < VALID_DPI_RANGE.min || dpi > VALID_DPI_RANGE.max) {
      throw new Error(`Invalid DPI: ${dpi}. Must be integer between ${VALID_DPI_RANGE.min}-${VALID_DPI_RANGE.max}`);
    }

    const colorMode = options.colorMode ?? 'gray';
    if (!VALID_COLOR_MODES.includes(colorMode)) {
      throw new Error(`Invalid colorMode: ${colorMode}`);
    }

    const source = options.source ?? 'feeder';
    if (!VALID_SOURCES.includes(source)) {
      throw new Error(`Invalid source: ${source}`);
    }

    const format = options.format ?? 'pdf';
    if (!VALID_FORMATS.includes(format)) {
      throw new Error(`Invalid format: ${format}`);
    }

    // 임시 디렉토리 생성
    if (!fs.existsSync(this.tempDir)) {
      console.log('[Scanner] scan: 임시 디렉토리 생성:', this.tempDir);
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    const fileName = `${crypto.randomUUID()}.${format === 'jpeg' ? 'jpg' : format}`;
    const tempPath = path.join(this.tempDir, fileName);

    // CLI 인자 구성
    const args = [
      '-o', tempPath,
      '--driver', 'twain',
      '--dpi', String(dpi),
      '--source', source,
      '--bitdepth', colorMode,
      '--noprofile',
      '--force',
      '--naps2data', this.naps2DataDir,
    ];

    if (options.device) {
      args.push('--device', options.device);
    }

    console.log('[Scanner] scan: 실행 명령:', naps2Path);
    console.log('[Scanner] scan: CLI 인자:', args.join(' '));

    this.isScanning = true;

    try {
      await new Promise<void>((resolve, reject) => {
        this.currentProcess = execFile(
          naps2Path,
          args,
          { timeout: 120000 },
          (error, stdout, stderr) => {
            this.currentProcess = null;
            console.log('[Scanner] scan: stdout:', JSON.stringify(stdout));
            console.log('[Scanner] scan: stderr:', JSON.stringify(stderr));

            if (error) {
              console.error('[Scanner] scan: 에러:', error.message);
              console.error('[Scanner] scan: killed:', error.killed);
              console.error('[Scanner] scan: code:', (error as NodeJS.ErrnoException).code);
              // 타임아웃으로 종료된 경우
              if (error.killed) {
                return reject(new Error('Scan timed out'));
              }
              return reject(new Error(`Scan failed: ${stderr || error.message}`));
            }

            // 출력 파일 존재 확인
            const fileExists = fs.existsSync(tempPath);
            console.log('[Scanner] scan: 출력 파일 존재:', fileExists, '경로:', tempPath);
            if (!fileExists) {
              return reject(new Error('Scan completed but output file not found'));
            }

            const fileSize = fs.statSync(tempPath).size;
            console.log('[Scanner] scan: 출력 파일 크기:', fileSize, 'bytes');
            resolve();
          }
        );
        console.log('[Scanner] scan: 프로세스 시작됨, PID:', this.currentProcess?.pid);
      });

      console.log('[Scanner] scan: 성공! 파일:', tempPath);
      return {
        filePath: tempPath,
        mimeType: FORMAT_TO_MIME[format] || 'application/octet-stream',
      };
    } catch (err) {
      console.error('[Scanner] scan: 최종 에러:', (err as Error).message);
      throw err;
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * 임시 스캔 파일을 base64로 읽는다.
   */
  readScanFile(filePath: string): string {
    console.log('[Scanner] readScanFile: 경로:', filePath);
    // 보안: tempDir 내의 파일만 허용
    const normalized = path.normalize(filePath);
    if (!normalized.startsWith(this.tempDir)) {
      console.error('[Scanner] readScanFile: 접근 거부 - tempDir 밖:', normalized);
      throw new Error('Access denied: file is not in scan temp directory');
    }

    if (!fs.existsSync(normalized)) {
      console.error('[Scanner] readScanFile: 파일 없음:', normalized);
      throw new Error('Scan file not found');
    }

    const buf = fs.readFileSync(normalized);
    console.log('[Scanner] readScanFile: 읽기 성공, 크기:', buf.length, 'bytes');
    return buf.toString('base64');
  }

  /**
   * 특정 임시 스캔 파일을 삭제한다.
   */
  cleanupScanFile(filePath: string): void {
    console.log('[Scanner] cleanupScanFile: 대상:', filePath);
    const normalized = path.normalize(filePath);
    if (!normalized.startsWith(this.tempDir)) {
      console.error('[Scanner] cleanupScanFile: 접근 거부 - tempDir 밖:', normalized);
      throw new Error('Access denied: file is not in scan temp directory');
    }

    try {
      if (fs.existsSync(normalized)) {
        fs.unlinkSync(normalized);
        console.log('[Scanner] cleanupScanFile: 삭제 성공');
      } else {
        console.log('[Scanner] cleanupScanFile: 파일 이미 없음');
      }
    } catch (err) {
      console.warn('[Scanner] cleanupScanFile: 삭제 실패:', (err as Error).message);
    }
  }

  /**
   * 모든 임시 스캔 파일을 정리한다.
   */
  cleanup(): void {
    console.log('[Scanner] cleanup: 임시 디렉토리 정리 시작:', this.tempDir);
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        console.log('[Scanner] cleanup: 정리할 파일 수:', files.length);
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(this.tempDir, file));
          } catch {
            // 개별 파일 삭제 실패 무시
          }
        }
        fs.rmdirSync(this.tempDir);
        console.log('[Scanner] cleanup: 완료');
      } else {
        console.log('[Scanner] cleanup: 임시 디렉토리 없음, 건너뜀');
      }
    } catch (err) {
      console.warn('[Scanner] cleanup: 정리 실패:', (err as Error).message);
    }
  }

  /**
   * 진행 중인 스캔 프로세스를 강제 종료한다.
   */
  killProcess(): void {
    if (this.currentProcess) {
      console.log('[Scanner] killProcess: 프로세스 종료 시도, PID:', this.currentProcess.pid);
      try {
        this.currentProcess.kill();
        console.log('[Scanner] killProcess: 종료 성공');
      } catch (err) {
        console.warn('[Scanner] killProcess: 종료 실패:', (err as Error).message);
      }
      this.currentProcess = null;
      this.isScanning = false;
    }
  }
}
