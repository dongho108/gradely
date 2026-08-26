#!/usr/bin/env -S npx tsx
/**
 * 2026년 5월 grading_reports 14건의 OCR 환각·누락 버그가 현재 production 프롬프트
 * + 실제 Edge Function (extract-exam-structure, verify-semantic-grading-v2) 에서
 * 그대로 재현되는지, 그리고 OpenCV 전처리를 거치면 해결되는지를 진단한다.
 *
 * 사용법:
 *   .env.local 에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 필요.
 *   (Storage 다운로드용. RLS 막히면 SUPABASE_SERVICE_ROLE_KEY 도 사용.)
 *
 *   npx tsx scripts/verify-report-reproduction.ts                     # baseline 모드
 *   OPENCV=1 npx tsx scripts/verify-report-reproduction.ts            # opencv 모드만
 *   npx tsx scripts/verify-report-reproduction.ts --mode=both         # 양쪽 비교
 *   npx tsx scripts/verify-report-reproduction.ts --dry-run           # LLM 호출 없이 fixture/DB만 검증
 *   RUNS=3 npx tsx scripts/verify-report-reproduction.ts --mode=both  # 3회 평균
 *   FIXTURE=pk4ns48 npx tsx scripts/verify-report-reproduction.ts     # 단일 submission만
 *
 * 비결정성: LLM 호출이라 매 실행마다 결과가 약간씩 다를 수 있음 (RUNS=N으로 완화).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { getGradingPrompt } from '../lib/grading-prompts';
import type { GradingStrictness, AnswerKeyStructure, StudentExamStructure } from '../types/grading';
import { REPORT_FIXTURES, groupBySubmission, type ReportFixture } from './reports/fixtures';
import { initOpenCV, preprocessImage } from './reports/preprocess-opencv';
import { ANSWER_KEYS_CACHE } from './reports/answer-keys-cache';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// ============ .env.local 로드 (기존 verify-regrade-snapshot.ts 패턴) ============
function loadEnv() {
  const envPath = join(REPO_ROOT, '.env.local');
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // ignore
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 .env.local 에 필요합니다.');
  process.exit(1);
}

// Storage 다운로드는 service_role 가 있으면 그것을, 아니면 anon 으로 시도.
const STORAGE_KEY = SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY;
const BUCKET = 'exam-files';

const supabase = createClient(SUPABASE_URL, STORAGE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ============ CLI args ============
type Mode = 'baseline' | 'opencv' | 'both';
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const modeArg = args.find((a) => a.startsWith('--mode='))?.split('=')[1];
const opencvOnly = process.env.OPENCV === '1';
const mode: Mode = isDryRun
  ? 'baseline'
  : (modeArg as Mode) ?? (opencvOnly ? 'opencv' : 'baseline');
const RUNS = parseInt(process.env.RUNS || '1', 10);
const FIXTURE_FILTER = process.env.FIXTURE;

// OCR 실험용: 호출할 Edge Function 과 조합을 바꿔 끼운다.
//   EXTRACT_FN=extract-exam-structure-test OCR_MODEL=gemini-3.5-flash-lite OCR_PROMPT_MODE=v2
const EXTRACT_FN = process.env.EXTRACT_FN || "extract-exam-structure";
const OCR_MODEL = process.env.OCR_MODEL;
const OCR_PROMPT_MODE = process.env.OCR_PROMPT_MODE;
const OCR_THINKING = process.env.OCR_THINKING;

// ============ Edge Function 직접 호출 (verify-regrade-snapshot.ts:113-130 패턴) ============
async function callExtractExam(images: string[]): Promise<StudentExamStructure> {
  const url = `${SUPABASE_URL}/functions/v1/${EXTRACT_FN}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      images,
      // 실험용 함수에서만 사용된다 (운영 함수는 무시)
      ...(OCR_MODEL ? { model: OCR_MODEL } : {}),
      ...(OCR_PROMPT_MODE ? { promptMode: OCR_PROMPT_MODE } : {}),
      ...(OCR_THINKING ? { thinkingBudget: Number(OCR_THINKING) } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${EXTRACT_FN} HTTP ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { success: boolean; data?: StudentExamStructure; error?: string };
  if (!json.success || !json.data) throw new Error(`extract-exam-structure API error: ${json.error}`);
  return json.data;
}

interface SemanticGradingResult {
  id: string;
  isCorrect: boolean;
  reason: string;
}

async function callSemanticGrading(
  questions: { id: string; studentAnswer: string; correctAnswer: string; question?: string }[],
  systemPrompt: string
): Promise<SemanticGradingResult[]> {
  const url = `${SUPABASE_URL}/functions/v1/verify-semantic-grading-v2`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ questions, systemPrompt }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`verify-semantic-grading-v2 HTTP ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { success: boolean; data?: SemanticGradingResult[]; error?: string };
  if (!json.success || !json.data) throw new Error(`verify-semantic-grading-v2 API error: ${json.error}`);
  return json.data;
}

// ============ 로컬 매칭 (lib/grading-service.ts 와 동일) ============
function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()[\]{}]/g, '');
}
function isAnswerCorrect(studentAnswer: string, correctAnswer: string): boolean {
  const normStudent = normalizeText(studentAnswer);
  const possibleAnswers = correctAnswer.includes('|||')
    ? correctAnswer.split('|||').map(normalizeText)
    : correctAnswer.split(/[\\/|,]/).map(normalizeText);
  return possibleAnswers.some((ans) => ans === normStudent && ans !== '');
}

// ============ DB helpers ============
async function fetchAnswerKey(sessionId: string): Promise<{ structure: AnswerKeyStructure; strictness: GradingStrictness }> {
  // 1) 캐시 우선 (scripts/reports/answer-keys-cache.ts) — anon RLS 우회
  const cached = ANSWER_KEYS_CACHE[sessionId];
  if (cached) return cached;

  // 2) fallback: DB (service_role 키가 있어야 anon RLS 통과)
  const { data, error } = await supabase
    .from('exam_sessions')
    .select('answer_key_structure, grading_strictness')
    .eq('id', sessionId)
    .single();
  if (error) throw new Error(`fetchAnswerKey(${sessionId}): ${error.message} (캐시에도 없음 — answer-keys-cache.ts 갱신 필요)`);
  if (!data?.answer_key_structure) throw new Error(`session ${sessionId} has no answer_key_structure`);
  return {
    structure: data.answer_key_structure as AnswerKeyStructure,
    strictness: (data.grading_strictness as GradingStrictness) ?? 'standard',
  };
}

async function downloadSubmissionJpeg(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw new Error(`download ${storagePath}: ${error.message}`);
  if (!data) throw new Error(`download ${storagePath}: empty`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function bufferToDataUrl(buffer: Buffer, mime = 'image/jpeg'): string {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

// ============ 채점 재현 (lib/grading-service.ts:calculateGradingResult 로직 옮김) ============
interface PerQuestionResult {
  questionNumber: number;
  studentAnswer: string;
  correctAnswer: string;
  question?: string;
  isCorrect: boolean;
  aiReason?: string;
}

async function gradeWithStudentExam(
  answerKey: AnswerKeyStructure,
  studentExam: StudentExamStructure,
  strictness: GradingStrictness
): Promise<PerQuestionResult[]> {
  const results: PerQuestionResult[] = [];
  const aiQuestions: { id: string; studentAnswer: string; correctAnswer: string; question?: string }[] = [];

  Object.entries(answerKey.answers).forEach(([qNum, ans]) => {
    const studentAnswerRaw = studentExam.answers?.[qNum] ?? '(미작성)';
    const isUnanswered = studentAnswerRaw === '(미작성)' || studentAnswerRaw === '(판독불가)';
    if (isUnanswered) {
      results.push({
        questionNumber: parseInt(qNum),
        studentAnswer: studentAnswerRaw,
        correctAnswer: ans.text,
        question: ans.question,
        isCorrect: false,
      });
    } else {
      aiQuestions.push({ id: qNum, studentAnswer: studentAnswerRaw, correctAnswer: ans.text, question: ans.question });
      results.push({
        questionNumber: parseInt(qNum),
        studentAnswer: studentAnswerRaw,
        correctAnswer: ans.text,
        question: ans.question,
        isCorrect: false,
      });
    }
  });

  // strict는 본 fixture에 해당 없음(모두 lenient) — standard/lenient 분기만 처리
  if (strictness === 'strict') {
    results.forEach((r) => {
      if (r.studentAnswer !== '(미작성)' && r.studentAnswer !== '(판독불가)') {
        r.isCorrect = isAnswerCorrect(r.studentAnswer, r.correctAnswer);
      }
    });
    return results;
  }

  // 로컬 정확 일치 우선
  const aiNeeded: typeof aiQuestions = [];
  for (const q of aiQuestions) {
    if (isAnswerCorrect(q.studentAnswer, q.correctAnswer)) {
      const idx = results.findIndex((r) => r.questionNumber === parseInt(q.id));
      if (idx !== -1) {
        results[idx].isCorrect = true;
        results[idx].aiReason = '정답 일치';
      }
    } else {
      aiNeeded.push(q);
    }
  }
  if (aiNeeded.length > 0) {
    const aiResults = await callSemanticGrading(aiNeeded, getGradingPrompt(strictness));
    for (const ai of aiResults) {
      const idx = results.findIndex((r) => r.questionNumber === parseInt(ai.id));
      if (idx !== -1) {
        results[idx].isCorrect = ai.isCorrect;
        results[idx].aiReason = ai.reason;
      }
    }
  }
  return results;
}

// ============ 메인 흐름 ============
interface SubmissionRun {
  submissionId: string;
  studentName: string;
  baselineExam?: StudentExamStructure;
  opencvExam?: StudentExamStructure;
  baselineGraded?: PerQuestionResult[];
  opencvGraded?: PerQuestionResult[];
  error?: string;
}

interface ReportJudgment {
  fixture: ReportFixture;
  baselineAnswer?: string;
  opencvAnswer?: string;
  correctAnswer: string;
  baselineIsCorrect?: boolean;
  opencvIsCorrect?: boolean;
  bugReproduced: 'YES' | 'NO' | 'N/A';
  opencvOutcome: 'FIXED' | 'STILL_BROKEN' | 'NEW_BREAK' | 'N/A';
}

function judgeReport(
  fixture: ReportFixture,
  baseline: PerQuestionResult[] | undefined,
  opencv: PerQuestionResult[] | undefined,
  answerKey: AnswerKeyStructure
): ReportJudgment {
  const q = fixture.affectedQuestions[0];
  const baselineRes = baseline?.find((r) => r.questionNumber === q);
  const opencvRes = opencv?.find((r) => r.questionNumber === q);
  const correctAnswer = answerKey.answers[String(q)]?.text ?? '(unknown)';

  const isBlank = (s?: string) => s === '(미작성)' || s === '(판독불가)';
  const judgeOne = (res?: PerQuestionResult): boolean => {
    if (!res) return false;
    switch (fixture.expectedBugType) {
      case 'phantom':
        // 학생 빈칸인데 OCR이 답을 만들어냄 → bug 재현 = 답이 채워짐
        return !isBlank(res.studentAnswer);
      case 'missing':
        // 학생 작성인데 OCR이 (미작성)으로 인식 → bug 재현 = blank
        return isBlank(res.studentAnswer);
      case 'misread':
        // 학생 작성인데 다른 텍스트로 인식 → bug 재현 = AI가 정답으로 판정 (학생이 오답 적었는데 정답 처리)
        //   또는 답이 expectedStudentText와 다름
        if (!isBlank(res.studentAnswer)) {
          if (fixture.expectedStudentText) {
            const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
            if (norm(res.studentAnswer) !== norm(fixture.expectedStudentText)) return true;
          }
          // misread인데 ai가 정답이라고 판정한 경우
          if (res.isCorrect) return true;
        }
        return false;
    }
  };

  const baselineBug = baseline ? judgeOne(baselineRes) : undefined;
  const opencvBug = opencv ? judgeOne(opencvRes) : undefined;

  let bugReproduced: ReportJudgment['bugReproduced'] = 'N/A';
  if (baseline) bugReproduced = baselineBug ? 'YES' : 'NO';

  let opencvOutcome: ReportJudgment['opencvOutcome'] = 'N/A';
  if (baseline && opencv) {
    if (baselineBug && !opencvBug) opencvOutcome = 'FIXED';
    else if (baselineBug && opencvBug) opencvOutcome = 'STILL_BROKEN';
    else if (!baselineBug && opencvBug) opencvOutcome = 'NEW_BREAK';
    else opencvOutcome = 'N/A';
  }

  return {
    fixture,
    baselineAnswer: baselineRes?.studentAnswer,
    opencvAnswer: opencvRes?.studentAnswer,
    correctAnswer,
    baselineIsCorrect: baselineRes?.isCorrect,
    opencvIsCorrect: opencvRes?.isCorrect,
    bugReproduced,
    opencvOutcome,
  };
}

async function runOneSubmission(
  submissionId: string,
  fixtures: ReportFixture[],
  answerKey: AnswerKeyStructure,
  strictness: GradingStrictness
): Promise<SubmissionRun> {
  const f0 = fixtures[0];
  console.log(`\n--- ${submissionId} (${f0.studentName}) ---`);

  try {
    console.log(`  📥 다운로드 ${f0.storagePath}`);
    const originalJpeg = await downloadSubmissionJpeg(f0.storagePath);
    console.log(`     ${(originalJpeg.length / 1024).toFixed(0)} KB`);

    const out: SubmissionRun = { submissionId, studentName: f0.studentName };

    if (mode === 'baseline' || mode === 'both') {
      console.log(`  🔍 [baseline] extract-exam-structure 호출`);
      const exam = await callExtractExam([bufferToDataUrl(originalJpeg)]);
      out.baselineExam = exam;
      console.log(`     answers ${Object.keys(exam.answers || {}).length}개`);
      console.log(`  🧮 [baseline] 채점`);
      out.baselineGraded = await gradeWithStudentExam(answerKey, exam, strictness);
    }

    if (mode === 'opencv' || mode === 'both') {
      console.log(`  🛠  [opencv] 전처리`);
      const processed = await preprocessImage(originalJpeg);
      console.log(`     processed ${(processed.length / 1024).toFixed(0)} KB`);
      console.log(`  🔍 [opencv] extract-exam-structure 호출`);
      const exam = await callExtractExam([bufferToDataUrl(processed)]);
      out.opencvExam = exam;
      console.log(`     answers ${Object.keys(exam.answers || {}).length}개`);
      console.log(`  🧮 [opencv] 채점`);
      out.opencvGraded = await gradeWithStudentExam(answerKey, exam, strictness);
    }

    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ ERROR: ${msg}`);
    return { submissionId, studentName: f0.studentName, error: msg };
  }
}

function pad(s: string, n: number): string {
  // 한글 폭 고려한 패딩 (간이)
  let width = 0;
  for (const ch of s) width += /[ㄱ-힝]/.test(ch) ? 2 : 1;
  return s + ' '.repeat(Math.max(0, n - width));
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  let width = 0;
  let out = '';
  for (const ch of s) {
    const w = /[ㄱ-힝]/.test(ch) ? 2 : 1;
    if (width + w > n) {
      out += '…';
      break;
    }
    out += ch;
    width += w;
  }
  return out;
}

function printSummary(judgments: ReportJudgment[]) {
  console.log('\n\n========== 제보 재현 + OpenCV 효과 비교 ==========\n');

  const header = [
    pad('submission', 12),
    pad('student', 8),
    pad('Q', 4),
    pad('bugType', 10),
    pad('baselineOCR', 14),
    pad('opencvOCR', 14),
    pad('answer', 16),
    pad('bug재현', 8),
    pad('opencv', 14),
  ].join(' | ');
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const j of judgments) {
    console.log(
      [
        pad(j.fixture.submissionId, 12),
        pad(truncate(j.fixture.studentName, 8), 8),
        pad(String(j.fixture.affectedQuestions[0]), 4),
        pad(j.fixture.expectedBugType, 10),
        pad(truncate(j.baselineAnswer ?? '-', 14), 14),
        pad(truncate(j.opencvAnswer ?? '-', 14), 14),
        pad(truncate(j.correctAnswer, 16), 16),
        pad(j.bugReproduced, 8),
        pad(j.opencvOutcome, 14),
      ].join(' | ')
    );
  }

  // 집계
  const reproduced = judgments.filter((j) => j.bugReproduced === 'YES').length;
  const fixed = judgments.filter((j) => j.opencvOutcome === 'FIXED').length;
  const stillBroken = judgments.filter((j) => j.opencvOutcome === 'STILL_BROKEN').length;
  const newBreak = judgments.filter((j) => j.opencvOutcome === 'NEW_BREAK').length;
  const total = judgments.length;

  console.log('\n--- 집계 ---');
  console.log(`재현된 bug: ${reproduced}/${total}`);
  if (mode === 'both' || mode === 'opencv') {
    console.log(`OpenCV로 FIXED:        ${fixed}/${total}`);
    console.log(`OpenCV에도 STILL_BROKEN: ${stillBroken}/${total}`);
    console.log(`OpenCV로 NEW_BREAK(회귀): ${newBreak}/${total}`);
  }
}

function printDetailComment(judgments: ReportJudgment[]) {
  console.log('\n\n========== 제보 상세 ==========\n');
  for (const j of judgments) {
    const f = j.fixture;
    console.log(`[${f.submissionId}] ${f.studentName} Q${f.affectedQuestions[0]} (${f.expectedBugType})`);
    console.log(`  제보: ${f.comment}`);
    if (f.expectedStudentText) console.log(`  학생 실제: "${f.expectedStudentText}"`);
    console.log(`  정답:    "${j.correctAnswer}"`);
    if (j.baselineAnswer !== undefined)
      console.log(`  baseline OCR: "${j.baselineAnswer}"  → isCorrect=${j.baselineIsCorrect}`);
    if (j.opencvAnswer !== undefined)
      console.log(`  opencv   OCR: "${j.opencvAnswer}"  → isCorrect=${j.opencvIsCorrect}`);
    console.log(`  bug재현=${j.bugReproduced} | opencv결과=${j.opencvOutcome}`);
    console.log();
  }
}

async function main() {
  let fixtures = REPORT_FIXTURES;
  if (FIXTURE_FILTER) {
    fixtures = fixtures.filter((f) => f.submissionId === FIXTURE_FILTER);
    if (fixtures.length === 0) {
      console.error(`FIXTURE="${FIXTURE_FILTER}" 매칭되는 제보가 없습니다.`);
      process.exit(1);
    }
  }

  const opencvPreset = process.env.OPENCV_PRESET ?? 'aggressive';
  console.log(`=== 제보 재현 검증 (mode=${mode}, runs=${RUNS}, fixtures=${fixtures.length}) ===`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Storage key:  ${SERVICE_ROLE_KEY ? 'service_role' : 'anon'}`);
  if (mode === 'opencv' || mode === 'both') {
    console.log(`OpenCV preset: ${opencvPreset}`);
  }
  console.log();

  if (mode === 'opencv' || mode === 'both') {
    console.log('OpenCV.js 초기화...');
    await initOpenCV();
    console.log('OpenCV 준비됨\n');
  }

  if (isDryRun) {
    console.log('\n--- dry-run: fixtures + DB 답안키 검증만 ---\n');
    const sessionIds = [...new Set(fixtures.map((f) => f.sessionId))];
    for (const sid of sessionIds) {
      try {
        const { structure, strictness } = await fetchAnswerKey(sid);
        console.log(`  ✓ session ${sid}: ${Object.keys(structure.answers).length} answers, strictness=${strictness}`);
      } catch (err) {
        console.log(`  ✗ session ${sid}: ${(err as Error).message}`);
      }
    }
    console.log(`\n총 fixture: ${fixtures.length}`);
    return;
  }

  // session별 answer_key 캐시
  const answerKeyCache = new Map<string, { structure: AnswerKeyStructure; strictness: GradingStrictness }>();
  for (const sid of new Set(fixtures.map((f) => f.sessionId))) {
    answerKeyCache.set(sid, await fetchAnswerKey(sid));
  }

  // submission별로 묶어서 1회만 OCR
  const submissionGroups = groupBySubmission(fixtures);
  const allJudgments: ReportJudgment[] = [];
  const allRuns: SubmissionRun[] = [];

  for (const [submissionId, group] of submissionGroups) {
    const { structure: answerKey, strictness } = answerKeyCache.get(group[0].sessionId)!;
    const run = await runOneSubmission(submissionId, group, answerKey, strictness);
    allRuns.push(run);
    for (const f of group) {
      const j = judgeReport(f, run.baselineGraded, run.opencvGraded, answerKey);
      allJudgments.push(j);
    }
  }

  // 출력
  printSummary(allJudgments);
  printDetailComment(allJudgments);

  // 결과 파일로 저장 (디버깅용)
  const outDir = join(REPO_ROOT, '.omc', 'reports');
  try {
    mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const presetSuffix = mode === 'opencv' || mode === 'both' ? `-${opencvPreset}` : '';
    const file = join(outDir, `report-reproduction-${mode}${presetSuffix}-${stamp}.json`);
    writeFileSync(
      file,
      JSON.stringify({ mode, preset: opencvPreset, runs: RUNS, judgments: allJudgments, runs_raw: allRuns }, null, 2)
    );
    console.log(`\n결과 저장: ${file}`);
  } catch {
    // ignore
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
