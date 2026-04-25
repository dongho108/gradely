#!/usr/bin/env node
/**
 * 스냅샷 50문항을 실제 supabase edge function(verify-semantic-grading)으로
 * lenient 모드 재채점하여 결과를 비교하는 일회성 검증 스크립트.
 *
 * 목표:
 *   - 정답 → 오답으로 뒤집힘 0건
 *   - 사용자 isEdited 6건이 자동으로 정답 처리됨
 *   - 명백 오답 5건은 그대로 오답 유지
 *
 * 사용법:
 *   1) .env.local 에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 설정 필요
 *   2) `node scripts/verify-regrade-snapshot.mjs`
 *
 * 비결정성: LLM 호출이라 매 실행마다 결과가 약간씩 다를 수 있음.
 * 일관성 확인을 위해 RUNS=5 환경변수로 반복 실행 가능 (기본 1).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// .env.local 로드 (단순 KEY=VALUE 파싱)
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

// 스냅샷 (regrade-snapshot.ts와 동일 데이터, 임포트 회피용 인라인)
const SNAPSHOT = [
  { n: 1, q: 'account', c: '설명, 기술', s: '설명하다', isCorrect: true },
  { n: 2, q: 'enhance', c: '향상하다', s: '향상하다', isCorrect: true },
  { n: 3, q: 'cognition', c: '인지', s: '인지', isCorrect: true },
  { n: 4, q: 'caution', c: '경고하다', s: '경고', isCorrect: true },
  { n: 5, q: 'marginalise', c: '주변화하다', s: '주변화하다', isCorrect: true },
  { n: 6, q: 'adapt to', c: '~에 적응하다', s: '~에 익숙해지다', isCorrect: true },
  { n: 7, q: 'lock in', c: '고정되다', s: '잠기다', isCorrect: true, isEdited: true },
  { n: 8, q: 'activate', c: '활성화하다', s: '활성화하다', isCorrect: true },
  { n: 9, q: 'coolly', c: '냉담하게', s: '냉담하게', isCorrect: true },
  { n: 10, q: 'abandon', c: '폐지하다', s: '버리다', isCorrect: true },
  { n: 11, q: 'transit', c: '대중교통', s: '교통 변화하는', isCorrect: false },
  { n: 12, q: 'witness', c: '목격하다', s: '목격자', isCorrect: true },
  { n: 13, q: 'internal', c: '내적인, 내부의', s: '내적인', isCorrect: true },
  { n: 14, q: 'confidence', c: '자신감', s: '자신감', isCorrect: true },
  { n: 15, q: 'device', c: '기기', s: '장치', isCorrect: true },
  { n: 16, q: 'signify', c: '의미하다', s: '중요하다', isCorrect: true, isEdited: true },
  { n: 17, q: 'earbud', c: '이어버드(귀 안에 넣는 이어폰)', s: '이어버드', isCorrect: true },
  { n: 18, q: 'conventional', c: '전통적인', s: '전통적인', isCorrect: true },
  { n: 19, q: 'locate', c: '찾다', s: '위치하다', isCorrect: true, isEdited: true },
  { n: 20, q: 'accommodation', c: '숙박', s: '숙박시설', isCorrect: true },
  { n: 21, q: 'transition', c: '전환', s: '변화', isCorrect: true },
  { n: 22, q: 'representation', c: '표상', s: '대표', isCorrect: true, isEdited: true },
  { n: 23, q: 'commercialization', c: '상업화', s: '상업화', isCorrect: true },
  { n: 24, q: 'unintentionally', c: '의도하지 않게', s: '의도하지않게', isCorrect: true },
  { n: 25, q: 'tie', c: '(강한) 유대 [관계]', s: '묶다', isCorrect: true, isEdited: true },
  { n: 26, q: 'illustrate', c: '설명하다', s: '묘사하다', isCorrect: true },
  { n: 27, q: 'formulation', c: '공식화', s: '공식화', isCorrect: true },
  { n: 28, q: 'foster', c: '조성하다', s: '기르다', isCorrect: true },
  { n: 29, q: 'specific', c: '특정한', s: '특정하다', isCorrect: true },
  { n: 30, q: 'outrage', c: '분노', s: '분노', isCorrect: true },
  { n: 31, q: 'inclined to do', c: '~하는 경향이 있는', s: '~하길 선호하다', isCorrect: false },
  { n: 32, q: 'numerical', c: '수치적인, 숫자와 관련된', s: '수치적인', isCorrect: true },
  { n: 33, q: 'alternative', c: '대안의', s: '대안적인', isCorrect: true },
  { n: 34, q: 'GPS', c: '위성 위치 확인 시스템', s: 'GPS', isCorrect: true },
  { n: 35, q: 'accompany', c: '(~의) 반주를 하다', s: '반주하다', isCorrect: true },
  { n: 36, q: 'obtain', c: '얻다', s: '얻다', isCorrect: true },
  { n: 37, q: 'reflection', c: '성찰', s: '반성', isCorrect: true, isEdited: true },
  { n: 38, q: 'cognitive psychology', c: '인지 심리학', s: '인지 심리학', isCorrect: true },
  { n: 39, q: 'highlight', c: '부각[강조]하다', s: '강조하다', isCorrect: true },
  { n: 40, q: 'cumulative', c: '누적된', s: '계산적인', isCorrect: false },
  { n: 41, q: 'potentially', c: '잠재적으로', s: '잠재적으로', isCorrect: true },
  { n: 42, q: 'occasionally', c: '때때로', s: '가끔', isCorrect: true },
  { n: 43, q: 'justify', c: '정당화하다', s: '정의하다', isCorrect: false },
  { n: 44, q: 'via', c: '~을 통하여', s: '~를 통해', isCorrect: true },
  { n: 45, q: 'escape', c: '도피', s: '탈출하다', isCorrect: true },
  { n: 46, q: 'embody', c: '구현하다, 나타내다', s: '구현하다', isCorrect: true },
  { n: 47, q: 'monetary', c: '금전적인', s: '돈위주의', isCorrect: true },
  { n: 48, q: 'ecological', c: '생태의', s: '생태적으로', isCorrect: true },
  { n: 49, q: 'authority', c: '권한', s: '관객,', isCorrect: false },
  { n: 50, q: 'cast aside', c: '~을 버리다, 제쳐 놓다', s: '옆으로 치우다', isCorrect: true },
]

async function gradeOnce() {
  const url = `${SUPABASE_URL}/functions/v1/verify-semantic-grading`
  const body = {
    questions: SNAPSHOT.map(item => ({
      id: String(item.n),
      studentAnswer: item.s,
      correctAnswer: item.c,
      question: item.q,
    })),
    strictness: 'lenient',
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  const json = await res.json()
  if (!json.success) throw new Error(`API error: ${json.error}`)
  return json.data
}

function compare(aiResults) {
  const byId = new Map(aiResults.map(r => [parseInt(r.id), r]))
  const flipsToIncorrect = []
  const flipsToCorrect = []
  const editedAutoCorrect = []
  const editedStillIncorrect = []
  const wrongStillWrong = []

  for (const item of SNAPSHOT) {
    const ai = byId.get(item.n)
    if (!ai) continue
    if (item.isCorrect && !ai.isCorrect) {
      flipsToIncorrect.push({ n: item.n, q: item.q, s: item.s, c: item.c, reason: ai.reason })
    }
    if (!item.isCorrect && ai.isCorrect) {
      flipsToCorrect.push({ n: item.n, q: item.q, s: item.s, c: item.c, reason: ai.reason })
    }
    if (item.isEdited) {
      if (ai.isCorrect) editedAutoCorrect.push({ n: item.n, q: item.q, reason: ai.reason })
      else editedStillIncorrect.push({ n: item.n, q: item.q, reason: ai.reason })
    }
    if (!item.isCorrect && !ai.isCorrect) {
      wrongStillWrong.push({ n: item.n, q: item.q, reason: ai.reason })
    }
  }

  const newCorrect = aiResults.filter(r => r.isCorrect).length
  const oldCorrect = SNAPSHOT.filter(s => s.isCorrect).length

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

function printReport(idx, runs, diff) {
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
    flipsToIncorrect: new Map(),
    editedAutoCorrect: new Map(),
    wrongStillWrong: new Map(),
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
      console.error(`Run ${i + 1} 실패:`, err.message)
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
