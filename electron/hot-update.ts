import { app, net } from 'electron';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export interface UIManifest {
  version: string;  // SHA-256 hash of out.zip
  url: string;      // download URL
  size: number;     // zip file size in bytes
}

const MANIFEST_URL =
  'https://github.com/dongho108/ai-exam-grader/releases/download/ui-latest/ui-manifest.json';
const MANIFEST_TIMEOUT = 5_000;
const BUNDLE_TIMEOUT = 30_000;

function getCacheDir(): string {
  return path.join(app.getPath('userData'), 'ui-cache');
}

function getVersionFile(): string {
  return path.join(getCacheDir(), 'version.json');
}

function getCachedOutDir(): string {
  return path.join(getCacheDir(), 'out');
}

/**
 * Fetch the remote UI manifest from GitHub Releases.
 * Returns null on any error (network, timeout, parse).
 */
export async function fetchManifest(): Promise<UIManifest | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT);

    const response = await net.fetch(MANIFEST_URL, {
      signal: controller.signal as AbortSignal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      console.log(`[HotUpdate] Manifest fetch failed: HTTP ${response.status}`);
      return null;
    }

    const manifest = (await response.json()) as UIManifest;
    console.log(`[HotUpdate] Remote manifest version: ${manifest.version}`);
    return manifest;
  } catch (err) {
    console.log(`[HotUpdate] Failed to fetch manifest: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Compare remote manifest version against locally cached version.
 * Returns true if an update is needed.
 */
export function needsUpdate(remote: UIManifest): boolean {
  try {
    const versionFile = getVersionFile();
    if (!fs.existsSync(versionFile)) {
      console.log('[HotUpdate] No local version file, update needed');
      return true;
    }

    const local = JSON.parse(fs.readFileSync(versionFile, 'utf-8'));
    if (local.version !== remote.version) {
      console.log(`[HotUpdate] Version mismatch: local=${local.version}, remote=${remote.version}`);
      return true;
    }

    console.log('[HotUpdate] UI bundle is up to date');
    return false;
  } catch (err) {
    console.log(`[HotUpdate] Error reading local version: ${(err as Error).message}`);
    return true;
  }
}

/**
 * Download the zip from manifest.url, extract to ui-cache/out/.
 * Returns true on success, false on failure.
 */
export async function downloadAndExtract(manifest: UIManifest): Promise<boolean> {
  const cacheDir = getCacheDir();
  const zipPath = path.join(cacheDir, 'out.zip');
  const tempDir = path.join(cacheDir, 'out-temp');
  const outDir = getCachedOutDir();
  const versionFile = getVersionFile();

  try {
    fs.mkdirSync(cacheDir, { recursive: true });

    console.log(`[HotUpdate] Downloading UI bundle from ${manifest.url}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BUNDLE_TIMEOUT);

    const response = await net.fetch(manifest.url, {
      signal: controller.signal as AbortSignal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      console.log(`[HotUpdate] Download failed: HTTP ${response.status}`);
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(zipPath, buffer);
    console.log(`[HotUpdate] Downloaded ${buffer.length} bytes`);

    // Extract to temp directory
    fs.mkdirSync(tempDir, { recursive: true });

    const unzipper = await import('unzipper');
    const unzipModule = unzipper.default ?? unzipper;
    const readable = Readable.from(buffer);
    await pipeline(readable, unzipModule.Extract({ path: tempDir }));
    console.log('[HotUpdate] Extraction complete');

    // Swap directories: remove old out/, rename temp → out
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
    fs.renameSync(tempDir, outDir);

    // Write version file
    fs.writeFileSync(versionFile, JSON.stringify({ version: manifest.version }));

    // Clean up zip
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }

    console.log('[HotUpdate] UI bundle updated successfully');
    return true;
  } catch (err) {
    console.error(`[HotUpdate] Download/extract failed: ${(err as Error).message}`);

    // Clean up on failure
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }

    return false;
  }
}

/**
 * Return the path to the UI 'out' directory.
 * Uses cached version if available, otherwise falls back to bundled.
 */
export function getOutDir(): string {
  const cached = getCachedOutDir();
  if (fs.existsSync(cached)) {
    return cached;
  }
  return path.join(__dirname, '..', 'out');
}

/**
 * Top-level update check. Safe to call at startup — never throws.
 */
export async function checkForUIUpdate(): Promise<boolean> {
  try {
    console.log('[HotUpdate] Checking for UI bundle update...');
    const manifest = await fetchManifest();
    if (!manifest) return false;

    if (!needsUpdate(manifest)) return false;

    const updated = await downloadAndExtract(manifest);
    return updated;
  } catch (err) {
    console.error(`[HotUpdate] Unexpected error: ${(err as Error).message}`);
    return false;
  }
}
