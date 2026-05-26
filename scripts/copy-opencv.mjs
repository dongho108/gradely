#!/usr/bin/env node
/**
 * @techstark/opencv-js 의 dist/opencv.js 를 public/opencv/opencv.js 로 복사.
 * Next 빌드(Turbopack/Webpack 둘 다)가 9MB opencv.js 를 파싱하다 죽는 문제를 우회하기 위해
 * import 대신 <script src="/opencv/opencv.js"> 로 런타임 로드한다.
 *
 * prebuild 훅에서 실행. Static export 시 public/ 은 그대로 out/ 에 복사됨.
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const src = join(ROOT, 'node_modules', '@techstark', 'opencv-js', 'dist', 'opencv.js');
const dstDir = join(ROOT, 'public', 'opencv');
const dst = join(dstDir, 'opencv.js');

if (!existsSync(src)) {
  console.error(`[copy-opencv] source not found: ${src}`);
  process.exit(1);
}

mkdirSync(dstDir, { recursive: true });
copyFileSync(src, dst);
console.log(`[copy-opencv] ${src} → ${dst}`);
