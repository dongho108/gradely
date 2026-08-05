/**
 * 단어장(SL PRIME) 기반 보조 사전.
 *
 * 정답지 한 칸에는 출제자가 고른 뜻만 적혀 있어서, 학생이 같은 단어의 다른 사전 의미로
 * 답하면 오답 처리되곤 했다. 단어장에 같은 영단어가 있으면 거기 실린 뜻도 정답 후보로
 * 인정해 이 격차를 메운다.
 *
 * 데이터는 `scripts/build-vocabulary.mjs` 가 엑셀에서 굽는다 (lib/data/vocabulary.json).
 * 표제어 정규화 규칙은 그 스크립트의 normalizeHeadword 와 반드시 일치해야 한다.
 */

import { parseCorrectAnswers } from './answer-candidates';

type Vocabulary = Record<string, string>;

let vocabulary: Vocabulary | null = null;
let loading: Promise<void> | null = null;

/** 표제어 정규화 — build-vocabulary.mjs 와 동일한 규칙 */
function normalizeHeadword(word: string): string {
  return word.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 표제어로 인정할 영어 표현: 알파벳으로 시작하고 ASCII 문자·기호로만 구성 */
const ENGLISH_PHRASE_PATTERN = /^[A-Za-z][A-Za-z0-9\s'’\-.~()/]*$/;

/** 단어·숙어까지만 표제어로 본다. 이보다 길면 지문(문장)으로 판단해 조회하지 않는다. */
const MAX_HEADWORD_WORDS = 6;

/**
 * 문항에서 단어장 조회에 쓸 영어 표제어를 뽑는다.
 *
 * 영→한 문항(지문이 영단어, 정답이 한국어 뜻)에서만 의미가 있다.
 * 한→영 문항은 정답 자체가 영어라 단어장의 한국어 뜻이 학생 답안이 될 수 없으므로 null.
 */
export function extractEnglishHeadword(
  question: string | undefined,
  _correctAnswer: string
): string | null {
  if (!question) return null;

  const trimmed = question.trim();
  if (!trimmed || !ENGLISH_PHRASE_PATTERN.test(trimmed)) return null;
  if (trimmed.split(/\s+/).length > MAX_HEADWORD_WORDS) return null;

  return trimmed;
}

/** 한글이 포함되어 있는가 */
export function hasHangul(text: string): boolean {
  return /[가-힣]/.test(text);
}

/** 영어 단어·숙어로 볼 수 있는가 (한→영 문항 판별에 사용) */
export function isEnglishPhrase(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length > 0 &&
    ENGLISH_PHRASE_PATTERN.test(trimmed) &&
    trimmed.split(/\s+/).length <= MAX_HEADWORD_WORDS
  );
}

/** 단어장에서 표제어의 모든 뜻을 정답 후보로 분해해 반환한다. */
export function lookupMeanings(word: string): string[] {
  if (!word || !vocabulary) return [];

  const raw = vocabulary[normalizeHeadword(word)];
  if (!raw) return [];

  return parseCorrectAnswers(raw);
}

/** 단어장 JSON을 한 번만 로드한다. 실패해도 채점 흐름을 막지 않는다. */
export async function ensureVocabularyLoaded(): Promise<void> {
  if (vocabulary) return;
  if (loading) return loading;

  loading = (async () => {
    try {
      const mod = await import('./data/vocabulary.json');
      vocabulary = (mod.default ?? mod) as Vocabulary;
    } catch (error) {
      console.warn('단어장 로드 실패 — 정답지에 적힌 뜻만으로 채점합니다:', error);
      vocabulary = {};
    }
  })();

  return loading;
}

/** 테스트용 주입 */
export function __setVocabularyForTest(data: Vocabulary | null): void {
  vocabulary = data;
  loading = null;
}
