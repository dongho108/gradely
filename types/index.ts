import type { GradingStrictness } from './grading'

/**
 * Represents a single tab (exam session) in the application.
 */
export interface ExamSession {
  id: string;
  title: string;
  createdAt: number;
  status: 'idle' | 'uploading' | 'extracting' | 'ready' | 'grading' | 'scanning-answer';

  // Metadata for the Answer Key PDF
  answerKeyFile?: {
    name: string;
    size: number;
    // Runtime file references (not serializable - undefined for server-loaded sessions)
    fileRefs?: File[];
    // Supabase Storage path (used to lazy-download the file when needed)
    storagePath?: string;
  };

  // 채점 엄격도 (null/undefined → 사용자 기본값 사용)
  gradingStrictness?: GradingStrictness;
}

export type TabId = string;

// Scanner types
export interface ScanOptions {
  device?: string;
  dpi?: number;
  colorMode?: 'color' | 'gray' | 'bw';
  format?: 'pdf' | 'jpeg' | 'png';
  source?: 'glass' | 'feeder' | 'duplex';
  driver?: 'twain' | 'wia';
}

export interface ScanResult {
  filePath: string;
  mimeType: string;
  /** ADF 멀티페이지 스캔 시 NAPS2가 생성한 추가 파일 경로들 */
  additionalFiles?: string[];
}

export interface ScannerDevice {
  name: string;
  driver: 'twain' | 'wia' | 'usb-drive';
  /** USB 드라이브 문자 (예: 'E:') — driver가 'usb-drive'일 때 */
  driveLetter?: string;
  /** Canon ONTOUCHL.exe 경로 — 있으면 Canon 전용 워크플로우 */
  onTouchLitePath?: string;
  /** USB 드라이브에 이미지 파일이 직접 존재하는지 여부 */
  hasImageFiles?: boolean;
}

export interface ScannerAvailability {
  available: boolean;
  reason?: 'windows-only' | 'naps2-not-found' | 'no-device-found' | 'permission-denied';
  path?: string;
}

export interface ListDevicesResult {
  devices: ScannerDevice[];
  error?: { type: 'permission' | 'timeout' | 'unknown'; message: string };
}

// --- Scanner Batch Workflow Types ---

import type { AnswerKeyStructure, StudentExamStructure } from './grading'

export interface AnswerKeyEntry {
  id: string;
  title: string;
  files: File[];
  structure: AnswerKeyStructure;
  createdAt: number;
}

export type ScanSessionStatus = 'idle' | 'scanning' | 'processing' | 'completed' | 'error';

export interface ScanSession {
  id: string;
  status: ScanSessionStatus;
  pages: ScannedPage[];
  startedAt: number;
}

export interface ScannedPage {
  id: string;
  file: File;
  /** Duplex 등 다중 페이지일 때 전체 파일 배열. 없으면 [file]로 취급. */
  files?: File[];
  ocrResult?: StudentExamStructure;
  matchedAnswerKey?: string;
}

export interface ClassifiedStudent {
  name: string;
  className?: string;
  examTitle: string;
  pages: ScannedPage[];
  answerKeyId: string;
}
