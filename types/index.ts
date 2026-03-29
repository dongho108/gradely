/**
 * Represents a single tab (exam session) in the application.
 */
export interface ExamSession {
  id: string;
  title: string;
  createdAt: number;
  status: 'idle' | 'uploading' | 'extracting' | 'ready' | 'grading';
  
  // Metadata for the Answer Key PDF
  answerKeyFile?: {
    name: string;
    size: number;
    // Runtime file reference (not serializable - undefined for server-loaded sessions)
    fileRef?: File;
    // Supabase Storage path (used to lazy-download the file when needed)
    storagePath?: string;
  };
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
}

export interface ScannerDevice {
  name: string;
  driver: 'twain' | 'wia';
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
  file: File;
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
