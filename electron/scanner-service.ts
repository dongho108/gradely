import { app } from 'electron';
import { execFile, execFileSync, spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const VALID_DPI_RANGE = { min: 75, max: 1200 };
const VALID_COLOR_MODES = ['color', 'gray', 'bw'] as const;
const VALID_SOURCES = ['glass', 'feeder', 'duplex'] as const;
const VALID_FORMATS = ['pdf', 'jpeg', 'png'] as const;
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf', '.tiff', '.tif', '.bmp'] as const;

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
  driver?: 'twain' | 'wia';
}

interface ScanResult {
  filePath: string;
  mimeType: string;
  additionalFiles?: string[];
}

interface ScannerDevice {
  name: string;
  driver: 'twain' | 'wia' | 'usb-drive';
  driveLetter?: string;
  onTouchLitePath?: string;
  hasImageFiles?: boolean;
}

interface ScannerAvailability {
  available: boolean;
  reason?: 'windows-only' | 'naps2-not-found' | 'permission-denied';
  path?: string;
}

interface ListDevicesResult {
  devices: ScannerDevice[];
  error?: { type: 'permission' | 'timeout' | 'unknown'; message: string };
}

export class ScannerService {
  private cachedNaps2Path: string | null = null;
  private isScanning = false;
  private currentProcess: ChildProcess | null = null;
  private lastSuccessfulDriver: 'twain' | 'wia' | null = null;
  private lastDetectedDevice: string | null = null;
  private pendingListDevices: Promise<ListDevicesResult> | null = null;

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
   * 포터블 모드를 우회한 NAPS2 복사본 경로를 반환한다.
   */
  private get naps2AppDir(): string {
    return path.join(app.getPath('userData'), 'naps2-app');
  }

  /**
   * NAPS2 실행 시 사용할 환경변수를 반환한다.
   * NAPS2_DATA를 설정하여 Program Files 내 Data 폴더 생성 문제를 회피한다.
   */
  private get naps2Env(): NodeJS.ProcessEnv {
    return { ...process.env, NAPS2_DATA: this.naps2DataDir };
  }

  /**
   * NAPS2를 항상 쓰기 가능한 위치({userData}/naps2-app/)에서 실행하도록 한다.
   * C:\Program Files\ 아래에서는 NAPS2가 Data/, recovery 등을 생성하려 할 때
   * UnauthorizedAccessException이 발생하므로, exe와 설정 파일만 복사하고
   * lib/ 디렉토리는 원본으로의 정션(junction)을 생성한다.
   * .version 파일 비교로 앱 업데이트 시에만 복사본을 갱신한다.
   */
  private ensureWritableNaps2(originalExePath: string): string {
    const originalAppDir = path.dirname(originalExePath);
    const naps2Root = path.dirname(originalAppDir);

    const destAppDir = path.join(this.naps2AppDir, 'App');
    const destExePath = path.join(destAppDir, 'NAPS2.Console.exe');
    const destLibDir = path.join(destAppDir, 'lib');
    const destVersionFile = path.join(this.naps2AppDir, '.version');

    // 번들된 NAPS2 버전 확인
    let bundledVersion = '';
    try {
      const versionFile = path.join(naps2Root, '.version');
      if (fs.existsSync(versionFile)) {
        bundledVersion = fs.readFileSync(versionFile, 'utf8').trim();
      }
    } catch { /* ignore */ }

    // 기존 복사본 버전 확인
    let copiedVersion = '';
    try {
      if (fs.existsSync(destVersionFile)) {
        copiedVersion = fs.readFileSync(destVersionFile, 'utf8').trim();
      }
    } catch { /* ignore */ }

    // 버전 일치 + 파일 존재 → 재사용
    const isUpToDate = bundledVersion !== ''
      && bundledVersion === copiedVersion
      && fs.existsSync(destExePath)
      && fs.existsSync(destLibDir);

    if (isUpToDate) {
      console.log('[Scanner] ensureWritableNaps2: 기존 복사본 사용:', destExePath);
      return destExePath;
    }

    console.log('[Scanner] ensureWritableNaps2: 쓰기 가능한 복사본 생성');

    try {
      // 버전 불일치 시 기존 복사본 정리
      if (copiedVersion && copiedVersion !== bundledVersion) {
        console.log('[Scanner] ensureWritableNaps2: 버전 불일치, 기존 복사본 제거');
        try {
          fs.rmSync(this.naps2AppDir, { recursive: true, force: true });
        } catch { /* ignore */ }
      }

      fs.mkdirSync(destAppDir, { recursive: true });

      // exe와 설정 파일 복사
      const filesToCopy = ['NAPS2.Console.exe', 'appsettings.xml'];
      for (const file of filesToCopy) {
        const src = path.join(originalAppDir, file);
        const dest = path.join(destAppDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
          console.log('[Scanner] ensureWritableNaps2: 복사:', file);
        }
      }

      // lib/ 디렉토리 정션 생성 (151MB 복사 회피)
      if (!fs.existsSync(destLibDir)) {
        const originalLibDir = path.join(originalAppDir, 'lib');
        execFileSync('powershell', [
          '-Command',
          `New-Item -ItemType Junction -Path '${destLibDir}' -Target '${originalLibDir}' -Force`,
        ], { timeout: 5000 });
        console.log('[Scanner] ensureWritableNaps2: lib/ 정션 생성 완료');
      }

      // naps2-data 디렉토리 생성
      if (!fs.existsSync(this.naps2DataDir)) {
        fs.mkdirSync(this.naps2DataDir, { recursive: true });
        console.log('[Scanner] ensureWritableNaps2: naps2-data 디렉토리 생성:', this.naps2DataDir);
      }

      // 버전 마커 기록
      if (bundledVersion) {
        try {
          fs.writeFileSync(destVersionFile, bundledVersion, 'utf8');
        } catch { /* ignore */ }
      }

      console.log('[Scanner] ensureWritableNaps2: 복사본 준비 완료:', destExePath);
      return destExePath;
    } catch (err) {
      console.warn('[Scanner] ensureWritableNaps2: 복사본 생성 실패, 원본 사용:', (err as Error).message);
      return originalExePath;
    }
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
        const resolvedPath = this.ensureWritableNaps2(normalized);
        this.cachedNaps2Path = resolvedPath;
        return resolvedPath;
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
   * 특정 드라이버로 스캐너 목록을 조회한다.
   */
  private listDevicesByDriver(driver: 'twain' | 'wia', timeout = 5000): Promise<ListDevicesResult> {
    return new Promise((resolve) => {
      const naps2Path = this.findNaps2Path();
      if (!naps2Path) {
        console.error('[Scanner] listDevicesByDriver: NAPS2 경로 없음');
        return resolve({ devices: [], error: { type: 'unknown', message: 'NAPS2 not found' } });
      }

      const args = ['--listdevices', '--driver', driver];
      console.log('[Scanner] listDevicesByDriver:', driver, '실행:', naps2Path, args.join(' '));
      console.log('[Scanner] listDevicesByDriver: NAPS2_DATA =', this.naps2DataDir);

      execFile(naps2Path, args, { timeout, env: this.naps2Env }, (error, stdout, stderr) => {
        // 권한 에러 감지 (terminal — fallback 안 함)
        const errorText = stderr || error?.message || '';
        if (/UnauthorizedAccessException|Access.*denied/i.test(errorText)) {
          console.error('[Scanner] listDevicesByDriver:', driver, '권한 에러:', errorText);
          return resolve({
            devices: [],
            error: {
              type: 'permission',
              message: '스캐너 접근 권한이 없습니다. 앱을 재설치하거나 관리자 권한으로 실행해 주세요.',
            },
          });
        }

        if (error) {
          console.error('[Scanner] listDevicesByDriver:', driver, '에러:', error.message);
          if (error.killed) {
            return resolve({ devices: [], error: { type: 'timeout', message: `Device listing timed out (${driver})` } });
          }
          return resolve({ devices: [], error: { type: 'unknown', message: stderr || error.message } });
        }

        console.log('[Scanner] listDevicesByDriver:', driver, 'stdout:', JSON.stringify(stdout));

        const devices: ScannerDevice[] = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((name) => ({ name, driver }));

        console.log('[Scanner] listDevicesByDriver:', driver, '디바이스:', JSON.stringify(devices));
        resolve({ devices });
      });
    });
  }

  /**
   * 연결된 스캐너 목록을 반환한다.
   * TWAIN/WIA + USB 드라이브 스캐너를 모두 조회한다.
   */
  async listDevices(): Promise<ListDevicesResult> {
    // 동시 호출 방지: TWAIN 드라이버가 동시 접근에 취약하므로 하나의 호출만 실행
    if (this.pendingListDevices) {
      console.log('[Scanner] listDevices: 이미 진행 중인 호출 대기');
      return this.pendingListDevices;
    }

    this.pendingListDevices = this._listDevicesImpl();
    try {
      return await this.pendingListDevices;
    } finally {
      this.pendingListDevices = null;
    }
  }

  /**
   * Windows PnP 장치 목록에서 실제 연결된 스캐너급 장치가 있는지 확인한다.
   * TWAIN 드라이버 캐시와 달리 전원이 꺼진 장치는 PnP에서 사라진다.
   * 에러 시 true를 반환하여 NAPS2 결과를 그대로 신뢰한다 (graceful degradation).
   */
  private checkUsbScannerPresence(): Promise<boolean> {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') {
        return resolve(true);
      }

      const cmd = 'powershell';
      const args = [
        '-NoProfile',
        '-Command',
        'Get-PnpDevice -Class Image,Scanner -Status OK -ErrorAction SilentlyContinue | Select-Object -Property FriendlyName | ConvertTo-Json -Compress',
      ];

      execFile(cmd, args, { timeout: 3000 }, (error, stdout) => {
        if (error) {
          console.warn('[Scanner] checkUsbScannerPresence: PowerShell 에러, NAPS2 결과 신뢰:', error.message);
          return resolve(true);
        }

        const trimmed = stdout.trim();
        if (!trimmed || trimmed === '' || trimmed === 'null') {
          console.log('[Scanner] checkUsbScannerPresence: PnP에 스캐너급 장치 없음');
          return resolve(false);
        }

        try {
          const parsed = JSON.parse(trimmed);
          // 단일 객체일 수 있고 배열일 수 있음
          const devices = Array.isArray(parsed) ? parsed : [parsed];
          console.log('[Scanner] checkUsbScannerPresence: PnP 장치', devices.length, '개 발견:', devices.map((d: { FriendlyName?: string }) => d.FriendlyName));
          return resolve(devices.length > 0);
        } catch {
          console.warn('[Scanner] checkUsbScannerPresence: JSON 파싱 실패, NAPS2 결과 신뢰');
          return resolve(true);
        }
      });
    });
  }

  private async _listDevicesImpl(): Promise<ListDevicesResult> {
    const naps2Devices: ScannerDevice[] = [];
    let naps2Error: ListDevicesResult['error'];

    // 1. NAPS2 (TWAIN/WIA) 조회
    const naps2Path = this.findNaps2Path();
    if (!naps2Path) {
      naps2Error = { type: 'unknown', message: 'NAPS2 not found' };
    } else if (naps2Path) {
      const primaryDriver = this.lastSuccessfulDriver ?? 'twain';
      const secondaryDriver: 'twain' | 'wia' = primaryDriver === 'twain' ? 'wia' : 'twain';

      console.log('[Scanner] listDevices: primary =', primaryDriver, ', secondary =', secondaryDriver);

      const primaryResult = await this.listDevicesByDriver(primaryDriver);

      if (primaryResult.error?.type === 'permission') {
        return primaryResult;
      }

      if (primaryResult.devices.length > 0) {
        this.lastSuccessfulDriver = primaryDriver;
        this.lastDetectedDevice = primaryResult.devices[0].name;
        naps2Devices.push(...primaryResult.devices);
      } else {
        console.log('[Scanner] listDevices:', primaryDriver, '결과 없음 →', secondaryDriver, 'fallback');
        const secondaryResult = await this.listDevicesByDriver(secondaryDriver);

        if (secondaryResult.error?.type === 'permission') {
          return secondaryResult;
        }

        if (secondaryResult.devices.length > 0) {
          this.lastSuccessfulDriver = secondaryDriver;
          this.lastDetectedDevice = secondaryResult.devices[0].name;
          naps2Devices.push(...secondaryResult.devices);
        } else {
          naps2Error = secondaryResult.error ?? primaryResult.error;
        }
      }
    }

    // 2. NAPS2가 장치를 찾았으면 PnP 교차 검증 + USB 드라이브 스캐너 병렬 조회
    const [pnpPresent, usbDevices] = await Promise.all([
      naps2Devices.length > 0
        ? this.checkUsbScannerPresence()
        : Promise.resolve(false),
      this.detectUsbScanners().catch((err) => {
        console.warn('[Scanner] listDevices: USB 스캐너 감지 실패:', (err as Error).message);
        return [] as ScannerDevice[];
      }),
    ]);

    const allDevices: ScannerDevice[] = [];

    // NAPS2가 장치를 찾았지만 PnP에 실제 장치가 없으면 캐시된 고스트 → 버림
    if (naps2Devices.length > 0 && !pnpPresent) {
      console.log('[Scanner] listDevices: NAPS2 장치 발견했지만 PnP 확인 실패 → 캐시된 고스트로 판단');
      this.lastSuccessfulDriver = null;
      this.lastDetectedDevice = null;
    } else {
      allDevices.push(...naps2Devices);
    }

    allDevices.push(...usbDevices);

    if (allDevices.length > 0) {
      return { devices: allDevices };
    }

    return { devices: [], error: naps2Error };
  }

  /**
   * 이동식 USB 드라이브에서 스캐너를 감지한다.
   * - ONTOUCHL.exe가 있으면 Canon 모드
   * - 이미지 파일이 있으면 일반 USB 모드
   */
  async detectUsbScanners(): Promise<ScannerDevice[]> {
    if (process.platform !== 'win32') return [];

    const devices: ScannerDevice[] = [];

    try {
      const psOutput = execFileSync('powershell', [
        '-Command',
        "Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 } | Select-Object DeviceID, VolumeName | ConvertTo-Json -Compress",
      ], { timeout: 5000, encoding: 'utf8' });

      const parsed = JSON.parse(psOutput || '[]');
      const drives: Array<{ DeviceID: string; VolumeName: string | null }> =
        Array.isArray(parsed) ? parsed : [parsed];

      for (const drive of drives) {
        if (!drive.DeviceID) continue;
        const driveLetter = drive.DeviceID;
        const drivePath = driveLetter + '\\';
        const volumeName = drive.VolumeName ?? '';

        // Canon OnTouch 실행 파일 확인 (Lite: ONTOUCHL.exe, 정식: ONTOUCH.exe)
        const onTouchCandidates = ['ONTOUCHL.exe', 'ONTOUCH.exe'];
        const foundOnTouch = onTouchCandidates
          .map(name => path.join(drivePath, name))
          .find(p => fs.existsSync(p));
        if (foundOnTouch) {
          const modelName = this.extractCanonModel(volumeName, drivePath);
          devices.push({
            name: `${modelName} (USB)`,
            driver: 'usb-drive',
            driveLetter,
            onTouchLitePath: foundOnTouch,
          });
          console.log('[Scanner] detectUsbScanners: Canon 감지:', driveLetter, modelName, path.basename(foundOnTouch));
          continue;
        }

        // 일반 이미지 파일 확인
        if (this.hasImageFiles(drivePath)) {
          devices.push({
            name: `USB 스캐너 (${driveLetter})`,
            driver: 'usb-drive',
            driveLetter,
            hasImageFiles: true,
          });
          console.log('[Scanner] detectUsbScanners: 이미지 드라이브 감지:', driveLetter);
        }
      }
    } catch (err) {
      console.warn('[Scanner] detectUsbScanners: 에러:', (err as Error).message);
    }

    return devices;
  }

  /**
   * Canon 모델명을 추출한다.
   */
  private extractCanonModel(volumeName: string, drivePath: string): string {
    // TOUCHDRL.ini에서 Scanner 필드 읽기
    try {
      const iniPath = path.join(drivePath, 'TOUCHDRL.ini');
      if (fs.existsSync(iniPath)) {
        const content = fs.readFileSync(iniPath, 'utf8');
        const match = content.match(/Scanner\s*=\s*(.+)/i);
        if (match) return `Canon ${match[1].trim()}`;
      }
    } catch { /* ignore */ }

    // 볼륨 이름으로 추론
    if (volumeName.toUpperCase().includes('ONTOUCH')) return 'Canon Scanner';
    return 'Canon Scanner';
  }

  /**
   * 디렉토리에 이미지 파일이 있는지 확인한다 (1단계 깊이만).
   */
  private hasImageFiles(dirPath: string): boolean {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      return entries.some(e =>
        e.isFile() && IMAGE_EXTENSIONS.includes(path.extname(e.name).toLowerCase() as typeof IMAGE_EXTENSIONS[number])
      );
    } catch {
      return false;
    }
  }

  /**
   * Canon Capture OnTouch (Lite 또는 정식)를 실행한다.
   */
  launchOnTouchLite(exePath: string): void {
    const normalized = path.normalize(exePath);

    // 보안: 이동식 드라이브 루트의 ONTOUCHL.exe 또는 ONTOUCH.exe만 허용
    const baseName = path.basename(normalized).toUpperCase();
    if (baseName !== 'ONTOUCHL.EXE' && baseName !== 'ONTOUCH.EXE') {
      throw new Error('Invalid OnTouch path');
    }

    if (!fs.existsSync(normalized)) {
      throw new Error('OnTouch Lite not found: ' + normalized);
    }

    console.log('[Scanner] launchOnTouchLite:', normalized);
    const child = spawn(normalized, [], { detached: true, stdio: 'ignore', cwd: path.dirname(normalized) });
    child.unref();
  }

  /**
   * 폴더에서 이미지/PDF 파일을 검색하여 임시 디렉토리에 복사한다.
   */
  importFromFolder(folderPath: string): { files: Array<{ filePath: string; mimeType: string }> } {
    const normalized = path.normalize(folderPath);
    if (!fs.existsSync(normalized) || !fs.statSync(normalized).isDirectory()) {
      throw new Error('Invalid folder path: ' + normalized);
    }

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    const results: Array<{ filePath: string; mimeType: string }> = [];
    const entries = fs.readdirSync(normalized, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.includes(ext as typeof IMAGE_EXTENSIONS[number])) continue;

      const srcPath = path.join(normalized, entry.name);
      const destName = `${crypto.randomUUID()}${ext}`;
      const destPath = path.join(this.tempDir, destName);

      fs.copyFileSync(srcPath, destPath);

      const mimeType = this.extToMime(ext);
      results.push({ filePath: destPath, mimeType });
    }

    console.log('[Scanner] importFromFolder:', normalized, '→', results.length, '파일');
    return { files: results };
  }

  /**
   * USB 드라이브에서 직접 이미지 파일을 가져온다.
   */
  importFromDrive(driveLetter: string): { files: Array<{ filePath: string; mimeType: string }> } {
    // 보안: 드라이브 문자 형식 검증 (예: "E:")
    if (!/^[A-Z]:$/i.test(driveLetter)) {
      throw new Error('Invalid drive letter: ' + driveLetter);
    }
    return this.importFromFolder(driveLetter + '\\');
  }

  private extToMime(ext: string): string {
    const map: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.pdf': 'application/pdf',
      '.tiff': 'image/tiff',
      '.tif': 'image/tiff',
      '.bmp': 'image/bmp',
    };
    return map[ext] || 'application/octet-stream';
  }

  /**
   * 단면(feeder) 모드 스캔 결과에서 듀플렉스 스캐너의 빈 뒷면 아티팩트를 제거한다.
   *
   * Canon imageFORMULA R40 등 일부 듀플렉스 ADF 스캐너는 TWAIN 드라이버 기본값이
   * 듀플렉스라 NAPS2가 `--source feeder` (단면)을 보내도 무시하고 양면 스캔을
   * 수행하여 빈 뒷면 페이지를 출력한다. 이 빈 페이지는 정상 스캔과 비교해
   * 파일 크기가 극단적으로 작다 (300dpi gray Letter 기준 ~70-80KB vs 정상 300KB+).
   *
   * 절대값(<80KB)과 상대값(최대 페이지 대비 <30%)을 모두 만족하는 페이지만
   * 제거하여 정상적인 sparse 답안지를 잘못 거르지 않도록 한다.
   *
   * 듀플렉스(--source duplex)나 1장 스캔 결과에는 적용하지 않는다.
   */
  private filterBlankDuplexBacksides(files: string[], source: string): string[] {
    if (source !== 'feeder' || files.length < 2) return files;

    const sizes = files.map(f => {
      try { return fs.statSync(f).size; } catch { return 0; }
    });
    const maxSize = Math.max(...sizes);

    // 가장 큰 파일이 충분히 작으면 (예: 모두 빈 페이지) 필터링하지 않는다.
    if (maxSize < 100 * 1024) return files;

    const ABS_THRESHOLD = 80 * 1024;
    const REL_THRESHOLD = 0.3;

    const kept: string[] = [];
    files.forEach((f, i) => {
      const size = sizes[i];
      if (size < ABS_THRESHOLD && size < maxSize * REL_THRESHOLD) {
        console.log(
          `[Scanner] scan: 빈 페이지(듀플렉스 뒷면 추정) 제외:`,
          path.basename(f), `(${size} bytes, max=${maxSize})`
        );
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      } else {
        kept.push(f);
      }
    });
    return kept;
  }

  /**
   * 스캔을 실행하고 임시 파일 경로를 반환한다.
   */
  /**
   * NAPS2 프로세스를 실행하여 스캔을 수행한다.
   */
  /**
   * NAPS2 프로세스를 실행하여 스캔을 수행한다.
   * ADF 멀티페이지 스캔 시 NAPS2가 번호 접미사 파일(uuid.1.jpg, uuid.2.jpg)을
   * 생성하므로, 모든 출력 파일 경로를 배열로 반환한다.
   */
  private execScanProcess(naps2Path: string, args: string[], tempPath: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      this.currentProcess = execFile(
        naps2Path,
        args,
        { timeout: 120000, env: this.naps2Env },
        (error, stdout, stderr) => {
          this.currentProcess = null;
          console.log('[Scanner] scan: stdout:', JSON.stringify(stdout));
          console.log('[Scanner] scan: stderr:', JSON.stringify(stderr));

          if (error) {
            console.error('[Scanner] scan: 에러:', error.message);
            console.error('[Scanner] scan: killed:', error.killed);
            console.error('[Scanner] scan: code:', (error as NodeJS.ErrnoException).code);

            const errorText = stderr || stdout || error.message;

            // 권한 에러 감지
            if (/UnauthorizedAccessException|Access.*denied/i.test(errorText)) {
              return reject(new Error('스캐너 접근 권한이 없습니다. 앱을 재설치하거나 관리자 권한으로 실행해 주세요.'));
            }

            // 타임아웃으로 종료된 경우
            if (error.killed) {
              return reject(new Error('Scan timed out'));
            }
            return reject(new Error(`Scan failed: ${errorText}`));
          }

          // 출력 파일 존재 확인
          if (fs.existsSync(tempPath)) {
            const fileSize = fs.statSync(tempPath).size;
            console.log('[Scanner] scan: 출력 파일 존재, 크기:', fileSize, 'bytes');
            return resolve([tempPath]);
          }

          // NAPS2 ADF 멀티페이지: uuid.1.jpg, uuid.2.jpg 등 번호 접미사 파일 탐색
          const dir = path.dirname(tempPath);
          const ext = path.extname(tempPath);
          const baseName = path.basename(tempPath, ext);
          const numberedFiles = fs.readdirSync(dir)
            .filter(f => {
              const match = f.match(new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d+)${ext.replace('.', '\\.')}$`));
              return match !== null;
            })
            .sort((a, b) => {
              const numA = parseInt(a.match(/\.(\d+)\.[^.]+$/)?.[1] ?? '0');
              const numB = parseInt(b.match(/\.(\d+)\.[^.]+$/)?.[1] ?? '0');
              return numA - numB;
            })
            .map(f => path.join(dir, f));

          if (numberedFiles.length > 0) {
            console.log('[Scanner] scan: 번호 접미사 파일 발견:', numberedFiles.length, '개');
            return resolve(numberedFiles);
          }

          console.error('[Scanner] scan: 출력 파일 없음, 경로:', tempPath);
          return reject(new Error('Scan completed but output file not found'));
        }
      );
      console.log('[Scanner] scan: 프로세스 시작됨, PID:', this.currentProcess?.pid);
    });
  }

  /**
   * 스캔 CLI 인자를 구성한다.
   */
  private buildScanArgs(
    tempPath: string,
    driver: string,
    dpi: number,
    source: string,
    colorMode: string,
    device?: string,
  ): string[] {
    const args = [
      '-o', tempPath,
      '--driver', driver,
      '--dpi', String(dpi),
      '--source', source,
      '--bitdepth', colorMode,
      '--noprofile',
      '--force',
    ];
    if (device) {
      args.push('--device', device);
    }
    return args;
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

    const ext = format === 'jpeg' ? 'jpg' : format;
    const driver = options.driver ?? this.lastSuccessfulDriver ?? 'twain';

    // 디바이스 미지정 시 캐시 또는 자동 감지
    let device = options.device;
    if (!device) {
      if (this.lastDetectedDevice) {
        device = this.lastDetectedDevice;
        console.log('[Scanner] scan: 캐시된 디바이스 사용:', device);
      } else {
        console.log('[Scanner] scan: 디바이스 미지정 → 자동 감지 시도');
        const detected = await this.listDevicesByDriver(driver);
        if (detected.devices.length > 0) {
          device = detected.devices[0].name;
          this.lastDetectedDevice = device;
          console.log('[Scanner] scan: 자동 감지 디바이스:', device);
        } else {
          const altDriver = driver === 'twain' ? 'wia' : 'twain';
          const altDetected = await this.listDevicesByDriver(altDriver);
          if (altDetected.devices.length > 0) {
            device = altDetected.devices[0].name;
            this.lastDetectedDevice = device;
            console.log('[Scanner] scan: 대체 드라이버로 감지된 디바이스:', device);
          }
        }
      }
    }

    const fileName = `${crypto.randomUUID()}.${ext}`;
    const tempPath = path.join(this.tempDir, fileName);
    const args = this.buildScanArgs(tempPath, driver, dpi, source, colorMode, device);

    console.log('[Scanner] scan: 실행 명령:', naps2Path);
    console.log('[Scanner] scan: CLI 인자:', args.join(' '));

    this.isScanning = true;

    try {
      let outputFiles: string[];
      try {
        outputFiles = await this.execScanProcess(naps2Path, args, tempPath);
      } catch (firstError) {
        // 드라이버가 명시된 경우 fallback하지 않음
        if (options.driver != null) throw firstError;

        const errMsg = (firstError as Error).message;
        // 권한 에러 또는 타임아웃은 fallback하지 않음
        if (/권한|UnauthorizedAccessException|Access.*denied/i.test(errMsg)) throw firstError;
        if (/timed out/i.test(errMsg)) throw firstError;
        // ADF 용지 없음은 드라이버 문제가 아니므로 fallback하지 않음.
        // WIA로 fallback 시 평판으로 자동 전환되어 의도치 않은 추가 페이지가
        // 만들어질 수 있다 (예: 2장 스캔 후 3번째 페이지 생성 버그).
        // UI 훅(use-tab-scan, use-batch-scan)의 noMorePagesPatterns와 동일한 집합을 유지한다.
        if (/no.?more.?pages|no documents|feeder.?empty|feeder is empty|out of paper|no paper|adf.?empty|NoMedia|No scanned pages/i.test(errMsg)) throw firstError;

        // 대체 드라이버로 재시도
        const altDriver = driver === 'twain' ? 'wia' : 'twain';
        console.log('[Scanner] scan: fallback →', altDriver);

        const altFileName = `${crypto.randomUUID()}.${ext}`;
        const altTempPath = path.join(this.tempDir, altFileName);
        const altArgs = this.buildScanArgs(altTempPath, altDriver, dpi, source, colorMode, options.device);

        outputFiles = await this.execScanProcess(naps2Path, altArgs, altTempPath);
        outputFiles = this.filterBlankDuplexBacksides(outputFiles, source);
        this.lastSuccessfulDriver = altDriver;

        const mimeType = FORMAT_TO_MIME[format] || 'application/octet-stream';
        console.log('[Scanner] scan: 성공! (fallback) 파일:', outputFiles.length, '개');
        return {
          filePath: outputFiles[0],
          mimeType,
          additionalFiles: outputFiles.length > 1 ? outputFiles.slice(1) : undefined,
        };
      }

      outputFiles = this.filterBlankDuplexBacksides(outputFiles, source);
      this.lastSuccessfulDriver = driver;
      const mimeType = FORMAT_TO_MIME[format] || 'application/octet-stream';
      console.log('[Scanner] scan: 성공! 파일:', outputFiles.length, '개');
      return {
        filePath: outputFiles[0],
        mimeType,
        additionalFiles: outputFiles.length > 1 ? outputFiles.slice(1) : undefined,
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
