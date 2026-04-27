#!/usr/bin/env -S npx tsx
/**
 * 스냅샷 50문항을 verify-semantic-grading-v2 edge function으로 lenient 모드 재채점하여
 * 결과를 비교하는 일회성 검증 스크립트.
 *
 * 목표:
 *   - 정답 → 오답으로 뒤집힘 0건
 *   - 사용자 isEdited 6건이 자동으로 정답 처리됨
 *   - 명백 오답 5건은 그대로 오답 유지
 *
 * 사용법:
 *   1) .env.local 에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 설정 필요
 *   2) `npx tsx scripts/verify-regrade-snapshot.ts`
 *   3) 반복 실행: `RUNS=5 npx tsx scripts/verify-regrade-snapshot.ts`
 *
 * 비결정성: LLM 호출이라 매 실행마다 결과가 약간씩 다를 수 있음.
 *
 * 프롬프트 출처: lib/grading-prompts.ts (TypeScript 모듈을 그대로 임포트)
 *   → 프롬프트를 수정하면 edge function 재배포 없이 다음 실행에 즉시 반영됨.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getGradingPrompt } from '../lib/grading-prompts'
import { SNAPSHOT_RESULTS as SNAPSHOT_1 } from '../lib/__tests__/fixtures/regrade-snapshot'

// grading-service의 isAnswerCorrect를 그대로 옮긴 로컬 매칭 (실제 채점 흐름과 동일하게 검증)
function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()[\]{}]/g, '')
}
function isAnswerCorrect(studentAnswer: string, correctAnswer: string): boolean {
  const normStudent = normalizeText(studentAnswer)
  const possibleAnswers = correctAnswer.includes('|||')
    ? correctAnswer.split('|||').map(a => normalizeText(a))
    : correctAnswer.split(/[\\/|,]/).map(a => normalizeText(a))
  return possibleAnswers.some(ans => ans === normStudent && ans !== '')
}
import { SNAPSHOT_RESULTS_2, SHOULD_FLIP_TO_CORRECT_2, SHOULD_STAY_INCORRECT_2 } from '../lib/__tests__/fixtures/regrade-snapshot-2'
import { SNAPSHOT_RESULTS_3, SHOULD_FLIP_TO_CORRECT_3, SHOULD_STAY_INCORRECT_3 } from '../lib/__tests__/fixtures/regrade-snapshot-3'

const SNAPSHOT_NAME = process.env.SNAPSHOT || '1'
const SNAPSHOTS: Record<string, { name: string; data: typeof SNAPSHOT_1; flips?: number[]; stays?: number[] }> = {
  '1': { name: '#1 (사용자 isEdited 6건)', data: SNAPSHOT_1 },
  '2': { name: '#2 (다의어 누락 다수)', data: SNAPSHOT_RESULTS_2, flips: SHOULD_FLIP_TO_CORRECT_2, stays: SHOULD_STAY_INCORRECT_2 },
  '3': { name: '#3 (isEdited 5건 + 다의어 4건)', data: SNAPSHOT_RESULTS_3, flips: SHOULD_FLIP_TO_CORRECT_3, stays: SHOULD_STAY_INCORRECT_3 },
}
const selected = SNAPSHOTS[SNAPSHOT_NAME]
if (!selected) {
  console.error(`Unknown SNAPSHOT="${SNAPSHOT_NAME}". Use 1, 2, or 3.`)
  process.exit(1)
}
const SNAPSHOT_RESULTS = selected.data

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const envPath = join(__dirname, '..', '.env.local')
  try {
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // ignore
  }
}
loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 .env.local 에 필요합니다.')
  process.exit(1)
}

interface AIResult {
  id: string
  isCorrect: boolean
  reason: string
}

async function gradeOnce(): Promise<AIResult[]> {
  const url = `${SUPABASE_URL}/functions/v1/verify-semantic-grading-v2`
  const systemPrompt = getGradingPrompt('lenient')

  // grading-service와 동일하게 로컬 정확 일치 우선 처리: 매칭되는 항목은 AI 호출 없이 정답으로 결정
  const localMatched: AIResult[] = []
  const aiNeeded: { id: string; studentAnswer: string; correctAnswer: string; question?: string }[] = []
  for (const item of SNAPSHOT_RESULTS) {
    if (isAnswerCorrect(item.studentAnswer, item.correctAnswer)) {
      localMatched.push({ id: String(item.questionNumber), isCorrect: true, reason: '정답 일치' })
    } else {
      aiNeeded.push({
        id: String(item.questionNumber),
        studentAnswer: item.studentAnswer,
        correctAnswer: item.correctAnswer,
        question: item.question,
      })
    }
  }

  // 모두 로컬 매칭이면 AI 호출 생략
  if (aiNeeded.length === 0) return localMatched

  const body = { questions: aiNeeded, systemPrompt }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  const json = await res.json() as { success: boolean; data?: AIResult[]; error?: string }
  if (!json.success || !json.data) throw new Error(`API error: ${json.error}`)
  return [...localMatched, ...json.data]
}

interface DiffEntry {
  n: number
  q: string
  s: string
  c: string
  reason: string
}

function compare(aiResults: AIResult[]) {
  const byId = new Map(aiResults.map(r => [parseInt(r.id), r]))
  const flipsToIncorrect: DiffEntry[] = []
  const flipsToCorrect: DiffEntry[] = []
  const editedAutoCorrect: { n: number; q: string; reason: string }[] = []
  const editedStillIncorrect: { n: number; q: string; reason: string }[] = []
  const wrongStillWrong: { n: number; q: string; reason: string }[] = []

  for (const item of SNAPSHOT_RESULTS) {
    const ai = byId.get(item.questionNumber)
    if (!ai) continue
    const entry: DiffEntry = {
      n: item.questionNumber,
      q: item.question ?? '',
      s: item.studentAnswer,
      c: item.correctAnswer,
      reason: ai.reason,
    }
    if (item.isCorrect && !ai.isCorrect) flipsToIncorrect.push(entry)
    if (!item.isCorrect && ai.isCorrect) flipsToCorrect.push(entry)
    if (item.isEdited) {
      if (ai.isCorrect) editedAutoCorrect.push({ n: entry.n, q: entry.q, reason: ai.reason })
      else editedStillIncorrect.push({ n: entry.n, q: entry.q, reason: ai.reason })
    }
    if (!item.isCorrect && !ai.isCorrect) {
      wrongStillWrong.push({ n: entry.n, q: entry.q, reason: ai.reason })
    }
  }

  const newCorrect = aiResults.filter(r => r.isCorrect).length
  const oldCorrect = SNAPSHOT_RESULTS.filter(s => s.isCorrect).length

  return {
    oldScore: `${oldCorrect}/50`,
    newScore: `${newCorrect}/50`,
    flipsToIncorrect,
    flipsToCorrect,
    editedAutoCorrect,
    editedStillIncorrect,
    wrongStillWrong,
  }
}

function printReport(idx: number, runs: number, diff: ReturnType<typeof compare>, aiResults: AIResult[]) {
  const editedCount = SNAPSHOT_RESULTS.filter(r => r.isEdited).length
  const wrongCount = SNAPSHOT_RESULTS.filter(r => !r.isCorrect).length

  console.log(`\n=== Run ${idx + 1}/${runs} (스냅샷 ${selected.name}) ===`)
  console.log(`스냅샷 점수: ${diff.oldScore} → 재채점: ${diff.newScore}`)

  console.log(`\n[목표 1] 정답 → 오답 뒤집힘: ${diff.flipsToIncorrect.length}건 (목표 0)`)
  for (const f of diff.flipsToIncorrect) {
    console.log(`  ❌ ${f.n}. ${f.q} | 정답:"${f.c}" 학생:"${f.s}" | AI: ${f.reason}`)
  }

  if (editedCount > 0) {
    console.log(`\n[목표 2] isEdited ${editedCount}건 자동 정답: ${diff.editedAutoCorrect.length}/${editedCount}건`)
    for (const e of diff.editedAutoCorrect) {
      console.log(`  ✓ ${e.n}. ${e.q} | ${e.reason}`)
    }
    for (const e of diff.editedStillIncorrect) {
      console.log(`  ✗ ${e.n}. ${e.q} | ${e.reason}`)
    }
  }

  console.log(`\n[목표 3] 스냅샷 오답 ${wrongCount}건 유지: ${diff.wrongStillWrong.length}/${wrongCount}건`)

  if (diff.flipsToCorrect.length > 0) {
    console.log(`\n[참고] 오답 → 정답 뒤집힘: ${diff.flipsToCorrect.length}건`)
    for (const f of diff.flipsToCorrect) {
      console.log(`  ⚠ ${f.n}. ${f.q} | 정답:"${f.c}" 학생:"${f.s}" | AI: ${f.reason}`)
    }
  }

  // 스냅샷 #2/#3 전용: SHOULD_FLIP_TO_CORRECT / SHOULD_STAY_INCORRECT 검증
  if (selected.flips || selected.stays) {
    const byId = new Map(aiResults.map(r => [parseInt(r.id), r]))

    if (selected.flips) {
      const flipped = selected.flips.filter(n => byId.get(n)?.isCorrect === true)
      console.log(`\n[기대 1] 다의어/변형 정답 처리: ${flipped.length}/${selected.flips.length}건`)
      for (const n of selected.flips) {
        const ai = byId.get(n)
        const item = SNAPSHOT_RESULTS.find(r => r.questionNumber === n)!
        const ok = ai?.isCorrect ? '✓' : '✗'
        console.log(`  ${ok} ${n}. ${item.question} | 정답:"${item.correctAnswer}" 학생:"${item.studentAnswer}" | AI: ${ai?.reason ?? 'N/A'}`)
      }
    }

    if (selected.stays) {
      const stayed = selected.stays.filter(n => byId.get(n)?.isCorrect === false)
      console.log(`\n[기대 2] 명백 오답 유지: ${stayed.length}/${selected.stays.length}건`)
      for (const n of selected.stays) {
        const ai = byId.get(n)
        const item = SNAPSHOT_RESULTS.find(r => r.questionNumber === n)!
        const ok = ai?.isCorrect === false ? '✓' : '✗'
        console.log(`  ${ok} ${n}. ${item.question} | 정답:"${item.correctAnswer}" 학생:"${item.studentAnswer}" | AI: ${ai?.reason ?? 'N/A'}`)
      }
    }
  }
}

async function main() {
  const runs = parseInt(process.env.RUNS || '1', 10)
  const aggregate = {
    flipsToIncorrect: new Map<number, number>(),
    editedAutoCorrect: new Map<number, number>(),
    wrongStillWrong: new Map<number, number>(),
  }

  for (let i = 0; i < runs; i++) {
    try {
      const aiResults = await gradeOnce()
      const diff = compare(aiResults)
      printReport(i, runs, diff, aiResults)

      for (const f of diff.flipsToIncorrect) {
        aggregate.flipsToIncorrect.set(f.n, (aggregate.flipsToIncorrect.get(f.n) ?? 0) + 1)
      }
      for (const e of diff.editedAutoCorrect) {
        aggregate.editedAutoCorrect.set(e.n, (aggregate.editedAutoCorrect.get(e.n) ?? 0) + 1)
      }
      for (const w of diff.wrongStillWrong) {
        aggregate.wrongStillWrong.set(w.n, (aggregate.wrongStillWrong.get(w.n) ?? 0) + 1)
      }
    } catch (err) {
      console.error(`Run ${i + 1} 실패:`, (err as Error).message)
    }
  }

  if (runs > 1) {
    const editedNumbers = SNAPSHOT_RESULTS.filter(r => r.isEdited).map(r => r.questionNumber)
    const wrongNumbers = SNAPSHOT_RESULTS.filter(r => !r.isCorrect).map(r => r.questionNumber)

    console.log(`\n=== ${runs}회 집계 (스냅샷 ${selected.name}) ===`)
    console.log('\n정답→오답 뒤집힘 빈도:')
    for (const [n, count] of [...aggregate.flipsToIncorrect.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}번: ${count}/${runs}회`)
    }

    if (editedNumbers.length > 0) {
      console.log(`\nisEdited 자동 정답 처리 빈도 (${editedNumbers.length}건 기준):`)
      for (const n of editedNumbers) {
        const count = aggregate.editedAutoCorrect.get(n) ?? 0
        console.log(`  ${n}번: ${count}/${runs}회`)
      }
    }

    console.log(`\n스냅샷 오답 유지 빈도 (${wrongNumbers.length}건 기준):`)
    for (const n of wrongNumbers) {
      const count = aggregate.wrongStillWrong.get(n) ?? 0
      console.log(`  ${n}번: ${count}/${runs}회`)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
