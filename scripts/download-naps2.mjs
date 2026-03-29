import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { createUnzip } from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const NAPS2_VERSION = '8.2.1';
const NAPS2_SHA256 = 'c042fca4c94fd9abb3569feedfc9df5d3f27b4789a283eb8ba4ac2ff1cc32df7';
const DOWNLOAD_URL = `https://github.com/cyanfish/naps2/releases/download/v${NAPS2_VERSION}/naps2-${NAPS2_VERSION}-win-x64.zip`;
const DEST_DIR = path.join(ROOT, 'resources', 'naps2');
const VERSION_FILE = path.join(DEST_DIR, '.version');

function fetchWithRedirects(url, redirectLimit = 10) {
  return new Promise((resolve, reject) => {
    if (redirectLimit <= 0) {
      return reject(new Error('Too many redirects'));
    }

    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const headers = { 'User-Agent': 'download-naps2-script/1.0' };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const req = lib.get(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); // drain response body
          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : `${parsedUrl.protocol}//${parsedUrl.host}${res.headers.location}`;
          resolve(fetchWithRedirects(redirectUrl, redirectLimit - 1));
        } else if (res.statusCode === 200) {
          resolve(res);
        } else {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
      }
    );

    req.on('error', (err) => {
      reject(new Error(`Network error fetching ${url}: ${err.message}`));
    });

    req.end();
  });
}

async function downloadWithProgress(url) {
  console.log(`Downloading NAPS2 v${NAPS2_VERSION}...`);
  console.log(`  URL: ${url}`);

  const res = await fetchWithRedirects(url);

  const contentLength = parseInt(res.headers['content-length'] || '0', 10);
  let downloaded = 0;
  let lastPrintedPercent = -1;

  const chunks = [];

  await new Promise((resolve, reject) => {
    res.on('data', (chunk) => {
      chunks.push(chunk);
      downloaded += chunk.length;

      if (contentLength > 0) {
        const percent = Math.floor((downloaded / contentLength) * 100);
        if (percent !== lastPrintedPercent && percent % 5 === 0) {
          process.stdout.write(`\r  Progress: ${percent}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
          lastPrintedPercent = percent;
        }
      } else {
        process.stdout.write(`\r  Downloaded: ${(downloaded / 1024 / 1024).toFixed(1)} MB`);
      }
    });
    res.on('end', resolve);
    res.on('error', (err) => reject(new Error(`Download stream error: ${err.message}`)));
  });

  process.stdout.write('\n');

  const buffer = Buffer.concat(chunks);
  console.log(`  Download complete: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
  return buffer;
}

function computeSha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function extractZip(buffer, destDir) {
  // Dynamic import so the script gives a clear error if unzipper isn't installed
  let unzipper;
  try {
    unzipper = (await import('unzipper')).default ?? (await import('unzipper'));
  } catch {
    throw new Error(
      'Package "unzipper" is not installed. Run: npm install --save-dev unzipper'
    );
  }

  console.log(`Extracting to ${destDir} ...`);
  fs.mkdirSync(destDir, { recursive: true });

  const { Readable } = await import('stream');
  const readable = Readable.from(buffer);
  await pipeline(readable, unzipper.Extract({ path: destDir }));
  console.log('  Extraction complete.');
}

async function main() {
  // Idempotency check
  if (fs.existsSync(VERSION_FILE)) {
    const existingVersion = fs.readFileSync(VERSION_FILE, 'utf8').trim();
    if (existingVersion === NAPS2_VERSION) {
      console.log(`NAPS2 v${NAPS2_VERSION} is already present at ${DEST_DIR}. Skipping download.`);
      return;
    }
    console.log(
      `Found existing version "${existingVersion}", expected "${NAPS2_VERSION}". Re-downloading.`
    );
  }

  // Download
  let zipBuffer;
  try {
    zipBuffer = await downloadWithProgress(DOWNLOAD_URL);
  } catch (err) {
    console.error(`\nFailed to download NAPS2: ${err.message}`);
    process.exit(1);
  }

  // SHA256 verification
  const computedHash = computeSha256(zipBuffer);
  if (NAPS2_SHA256 === null) {
    console.log(`\n  SHA256 (not yet verified): ${computedHash}`);
    console.log(
      `  To enable verification, set NAPS2_SHA256 = '${computedHash}' in this script.`
    );
  } else {
    if (computedHash !== NAPS2_SHA256) {
      console.error(
        `\nSHA256 mismatch!\n  Expected: ${NAPS2_SHA256}\n  Got:      ${computedHash}`
      );
      process.exit(1);
    }
    console.log(`  SHA256 verified: ${computedHash}`);
  }

  // Extract
  try {
    await extractZip(zipBuffer, DEST_DIR);
  } catch (err) {
    console.error(`\nFailed to extract ZIP: ${err.message}`);
    process.exit(1);
  }

  // Remove Data/ directory to force NAPS2_DATA env var usage
  // NAPS2 Portable checks {exe_dir}/../Data/ before NAPS2_DATA env var.
  // In Program Files this causes UnauthorizedAccessException.
  const dataDir = path.join(DEST_DIR, 'Data');
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    console.log('  Removed Data/ directory to force NAPS2_DATA env var usage');
  }

  // Write version marker
  fs.writeFileSync(VERSION_FILE, NAPS2_VERSION, 'utf8');
  console.log(`\nNAPS2 v${NAPS2_VERSION} installed to ${DEST_DIR}`);
}

main();
