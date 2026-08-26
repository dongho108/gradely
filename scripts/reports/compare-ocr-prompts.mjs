/**
 * 모델 x 프롬프트 조합 비교 — 프롬프트를 파일에서 그대로 읽어 전송한다.
 *
 * 이전 측정은 실험 함수에 옮겨 적은 사본을 썼고, 그 사본이 운영/배포본과
 * 달라 결과가 무효였다. 여기서는 전사 과정이 없다.
 *   baseline = origin/main 의 EXTRACT_EXAM_PROMPT  (운영 현재)
 *   candidate = 작업 트리의 EXTRACT_EXAM_PROMPT     (배포 예정)
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RUNS = parseInt(process.env.RUNS ?? '3', 10);

function extractTemplate(src) {
  const i = src.indexOf('EXTRACT_EXAM_PROMPT');
  const start = src.indexOf('`', i) + 1;
  const end = src.indexOf('`', start);
  return src.slice(start, end);
}

const PROMPT_OLD = extractTemplate(
  execSync('git show origin/main:supabase/functions/extract-exam-structure/prompts.ts', { encoding: 'utf8' }),
);
const PROMPT_NEW = extractTemplate(
  readFileSync('supabase/functions/extract-exam-structure/prompts.ts', 'utf8'),
);

console.log(`프롬프트 길이 — 운영 현재 ${PROMPT_OLD.length}자 / 배포 예정 ${PROMPT_NEW.length}자\n`);

const supabase = createClient(URL_, SVC, { auth: { persistSession: false } });
const USER = '2c3412c7-488a-4d4f-9754-3b079b3b5145';
const TARGETS = [
  { name: '김동하', sub: 'x9j4pgk', q: 41, actual: '존엄', key: '창' },
  { name: '김동하', sub: 'x9j4pgk', q: 42, actual: '적용한 이', key: '박수갈채' },
  { name: '임시명', sub: 'akbmxsz', q: 42, actual: '멈추다', key: '박수갈채' },
];
const COMBOS = [
  { model: 'gemini-3.1-flash-lite', prompt: PROMPT_OLD, label: '3.1 + 현행프롬프트 (운영)' },
  { model: 'gemini-3.1-flash-lite', prompt: PROMPT_NEW, label: '3.1 + 새프롬프트' },
  { model: 'gemini-3.5-flash-lite', prompt: PROMPT_OLD, label: '3.5 + 현행프롬프트' },
  { model: 'gemini-3.5-flash-lite', prompt: PROMPT_NEW, label: '3.5 + 새프롬프트 (PR)' },
];

const images = {};
for (const sub of [...new Set(TARGETS.map((t) => t.sub))]) {
  const { data, error } = await supabase.storage
    .from('exam-files')
    .download(`${USER}/ff54uzt/submissions/${sub}.jpeg`);
  if (error) throw new Error(`${sub}: ${error.message}`);
  images[sub] = `data:image/jpeg;base64,${Buffer.from(await data.arrayBuffer()).toString('base64')}`;
}

async function ocr(sub, combo) {
  const res = await fetch(`${URL_}/functions/v1/extract-exam-structure-test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: [images[sub]], model: combo.model, prompt: combo.prompt }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json;
}

const norm = (s) => String(s ?? '').trim().replace(/[.\s]+$/, '');
const tally = {};

for (const combo of COMBOS) {
  console.log(`=== ${combo.label} ===`);
  tally[combo.label] = { 정확: 0, 복사: 0, 오독: 0 };
  let lenChecked = false;

  for (let run = 1; run <= RUNS; run++) {
    for (const sub of Object.keys(images)) {
      let out;
      try {
        out = await ocr(sub, combo);
      } catch (e) {
        console.log(`  [run${run}] ${sub} 실패 — ${String(e.message).slice(0, 70)}`);
        continue;
      }
      if (!lenChecked) {
        const ok = out.meta.promptLength === combo.prompt.length;
        console.log(`  프롬프트 길이 확인: 전송 ${combo.prompt.length}자 / 함수 수신 ${out.meta.promptLength}자 ${ok ? 'OK' : '불일치!'}`);
        lenChecked = true;
      }
      for (const t of TARGETS.filter((x) => x.sub === sub)) {
        const got = norm(out.data.answers[String(t.q)]);
        const exact = got === norm(t.actual);
        const copied = !exact && (got === norm(t.key) || (t.key.includes(got) && got.length >= 2));
        tally[combo.label][exact ? '정확' : copied ? '복사' : '오독'] += 1;
        console.log(`  [run${run}] ${t.name} Q${t.q} 실제="${t.actual}" -> "${got}" [${exact ? '정확' : copied ? '정답복사' : '오독'}]`);
      }
    }
  }
  console.log('');
}

console.log(`=== 종합 (3문항 x ${RUNS}회 = ${3 * RUNS}판정) ===`);
for (const [label, t] of Object.entries(tally)) {
  const total = t.정확 + t.복사 + t.오독;
  console.log(`  ${label.padEnd(26)} 정확 ${t.정확}/${total}  정답복사 ${t.복사}/${total}  오독 ${t.오독}/${total}`);
}
