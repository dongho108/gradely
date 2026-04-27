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
import { SNAPSHOT_RESULTS } from '../lib/__tests__/fixtures/regrade-snapshot'

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
  const body = {
    questions: SNAPSHOT_RESULTS.map(item => ({
      id: String(item.questionNumber),
      studentAnswer: item.studentAnswer,
      correctAnswer: item.correctAnswer,
      question: item.question,
    })),
    systemPrompt,
  }

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
  return json.data
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

function printReport(idx: number, runs: number, diff: ReturnType<typeof compare>) {
  console.log(`\n=== Run ${idx + 1}/${runs} ===`)
  console.log(`스냅샷 점수: ${diff.oldScore} → 재채점: ${diff.newScore}`)

  console.log(`\n[목표 1] 정답 → 오답 뒤집힘: ${diff.flipsToIncorrect.length}건 (목표 0)`)
  for (const f of diff.flipsToIncorrect) {
    console.log(`  ❌ ${f.n}. ${f.q} | 정답:"${f.c}" 학생:"${f.s}" | AI: ${f.reason}`)
  }

  console.log(`\n[목표 2] isEdited 6건 자동 정답: ${diff.editedAutoCorrect.length}/6건`)
  for (const e of diff.editedAutoCorrect) {
    console.log(`  ✓ ${e.n}. ${e.q} | ${e.reason}`)
  }
  for (const e of diff.editedStillIncorrect) {
    console.log(`  ✗ ${e.n}. ${e.q} | ${e.reason}`)
  }

  console.log(`\n[목표 3] 명백 오답 5건 유지: ${diff.wrongStillWrong.length}/5건`)

  if (diff.flipsToCorrect.length > 0) {
    console.log(`\n[참고] 오답 → 정답 뒤집힘: ${diff.flipsToCorrect.length}건`)
    for (const f of diff.flipsToCorrect) {
      console.log(`  ⚠ ${f.n}. ${f.q} | 정답:"${f.c}" 학생:"${f.s}" | AI: ${f.reason}`)
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
      printReport(i, runs, diff)

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
    console.log(`\n=== ${runs}회 집계 ===`)
    console.log('\n정답→오답 뒤집힘 빈도:')
    for (const [n, count] of [...aggregate.flipsToIncorrect.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}번: ${count}/${runs}회`)
    }
    console.log('\nisEdited 자동 정답 처리 빈도 (6건 기준):')
    for (const n of [7, 16, 19, 22, 25, 37]) {
      const count = aggregate.editedAutoCorrect.get(n) ?? 0
      console.log(`  ${n}번: ${count}/${runs}회`)
    }
    console.log('\n명백 오답 유지 빈도 (5건 기준):')
    for (const n of [11, 31, 40, 43, 49]) {
      const count = aggregate.wrongStillWrong.get(n) ?? 0
      console.log(`  ${n}번: ${count}/${runs}회`)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
