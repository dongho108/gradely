#!/usr/bin/env node
/**
 * 단어장 엑셀(.xlsx) → lib/data/vocabulary.json 변환기.
 *
 * 채점 시 "정답지의 영단어가 단어장에 있으면 단어장에 실린 뜻도 정답으로 인정"하기 위한
 * 사전 데이터를 만든다. 런타임에 xlsx를 파싱하지 않도록 빌드 타임에 JSON으로 굽는다.
 *
 * 사용법:
 *   node scripts/build-vocabulary.mjs "C:/path/SL PRIME 단어장 전체.xlsx" [시트명]
 *   (시트명 기본값: "단어 전체" — A열 영어, B열 한글 뜻)
 *
 * 의존성 없이 동작한다: xlsx 는 zip + XML 이므로 Node 내장 zlib 으로 직접 푼다.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = join(REPO_ROOT, 'lib', 'data', 'vocabulary.json');

const xlsxPath = process.argv[2];
const sheetName = process.argv[3] ?? '단어 전체';

if (!xlsxPath) {
  console.error('사용법: node scripts/build-vocabulary.mjs <단어장.xlsx> [시트명]');
  process.exit(1);
}

/** zip 중앙 디렉터리를 훑어 { 경로: 내용(utf8) } 맵을 만든다. */
function readZip(buf) {
  const files = {};
  // End of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip EOCD를 찾을 수 없습니다 (xlsx 파일이 맞는지 확인하세요)');

  const entryCount = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    // local file header 에서 실제 데이터 시작 위치 계산
    const lhNameLen = buf.readUInt16LE(localOffset + 26);
    const lhExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    files[name] = method === 0 ? raw.toString('utf8') : inflateRawSync(raw).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
  }

  return files;
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

const files = readZip(readFileSync(xlsxPath));

// sharedStrings (없을 수도 있음 — inline string 방식)
const sharedStrings = files['xl/sharedStrings.xml']
  ? [...files['xl/sharedStrings.xml'].matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
      decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))
    )
  : [];

// 시트 이름 → 파일 경로
const sheets = [...files['xl/workbook.xml'].matchAll(/<sheet[^>]*?name="([^"]*)"[^>]*?r:id="([^"]*)"/g)];
const rels = Object.fromEntries(
  [...files['xl/_rels/workbook.xml.rels'].matchAll(/Id="([^"]*)"[^>]*?Target="([^"]*)"/g)].map((m) => [
    m[1],
    m[2],
  ])
);

const matched = sheets.find((m) => decodeXml(m[1]) === sheetName);
if (!matched) {
  console.error(`시트 "${sheetName}" 를 찾을 수 없습니다. 존재하는 시트: ${sheets.map((m) => decodeXml(m[1])).join(', ')}`);
  process.exit(1);
}

const sheetPath = 'xl/' + rels[matched[2]].replace(/^\/?xl\//, '');
const sheetXml = files[sheetPath];
if (!sheetXml) {
  console.error(`시트 파일을 읽을 수 없습니다: ${sheetPath}`);
  process.exit(1);
}

function cellValue(cellXml) {
  const t = cellXml.match(/ t="([^"]*)"/)?.[1] ?? 'n';
  if (t === 'inlineStr') {
    return decodeXml([...cellXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
  }
  const v = cellXml.match(/<v>([\s\S]*?)<\/v>/);
  if (!v) return '';
  if (t === 's') return sharedStrings[Number(v[1])] ?? '';
  return decodeXml(v[1]);
}

/** 표제어 정규화: 채점 시 조회 키와 동일해야 한다 (lib/vocab-dictionary.ts 와 규칙 일치) */
function normalizeHeadword(word) {
  return word.trim().toLowerCase().replace(/\s+/g, ' ');
}

const rows = [...sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)];
const dictionary = {};
let skipped = 0;

for (const [rowIndex, row] of rows.entries()) {
  if (rowIndex === 0) continue; // 헤더

  const cells = {};
  for (const m of row[1].matchAll(/<c[^>]*?r="([A-Z]+)\d+"[\s\S]*?(?:<\/c>|\/>)/g)) {
    cells[m[1]] = cellValue(m[0]);
  }

  const english = (cells.A ?? '').trim();
  const korean = (cells.B ?? '').trim();
  if (!english || !korean) {
    skipped++;
    continue;
  }

  const key = normalizeHeadword(english);
  if (dictionary[key]) {
    // 동일 표제어가 여러 행에 있으면 뜻을 합친다
    dictionary[key] = `${dictionary[key]}; ${korean}`;
  } else {
    dictionary[key] = korean;
  }
}

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(dictionary), 'utf8');

const bytes = Buffer.byteLength(JSON.stringify(dictionary));
console.log(`시트 "${sheetName}" 에서 ${rows.length - 1}행 처리`);
console.log(`표제어 ${Object.keys(dictionary).length}개 저장 (건너뜀 ${skipped}행)`);
console.log(`→ ${OUT_PATH} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
