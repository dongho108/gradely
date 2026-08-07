/**
 * 단어장(SL PRIME) 기반 보조 사전.
 *
 * 정답지 한 칸에는 출제자가 고른 뜻만 적혀 있어서, 학생이 같은 단어의 다른 사전 의미로
 * 답하면 오답 처리되곤 했다. 단어장에 같은 영단어가 있으면 거기 실린 뜻도 정답 후보로
 * 인정해 이 격차를 메운다.
 *
 * 데이터는 Supabase `SL_VOCA_DB` 테이블에 있다 (scripts/seed-vocabulary.mjs 로 적재).
 * 표제어 전체는 12,000건이 넘고 config.toml 의 max_rows 가 1000이라 통째로 받지 않는다.
 * 대신 채점 시작 시점에 필요한 표제어만 골라 조회하고(preloadVocabulary),
 * 이후 판정은 메모리 캐시에서 동기적으로 처리한다.
 */

import { supabase } from './supabase';
import { parseCorrectAnswers } from './answer-candidates';

const TABLE = 'SL_VOCA_DB';

/** URL 길이 제한을 고려한 IN 절 한 번당 표제어 수 */
const LOOKUP_CHUNK_SIZE = 200;

/**
 * 표제어 → 뜻 원문.
 * DB에 없는 표제어는 빈 문자열로 기록해 같은 단어를 반복 조회하지 않는다.
 */
const cache = new Map<string, string>();

/** 표제어 정규화 — seed 스크립트의 normalizeHeadword 와 동일한 규칙 */
function normalizeHeadword(word: string): string {
  return word.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 표제어로 인정할 영어 표현: 알파벳으로 시작하고 ASCII 문자·기호로만 구성 */
const ENGLISH_PHRASE_PATTERN = /^[A-Za-z][A-Za-z0-9\s'’\-.~()/]*$/;

/** 단어·숙어까지만 표제어로 본다. 이보다 길면 지문(문장)으로 판단해 조회하지 않는다. */
const MAX_HEADWORD_WORDS = 6;

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
  if (!trimmed || !isEnglishPhrase(trimmed)) return null;

  return trimmed;
}

/**
 * 채점에 필요한 표제어를 DB에서 미리 받아 캐시에 담는다.
 *
 * 이미 캐시에 있는 표제어는 건너뛰므로, 같은 정답지로 여러 학생을 채점해도
 * 네트워크 요청은 첫 채점 때 한 번만 발생한다.
 * 조회에 실패해도 예외를 던지지 않는다 — 단어장 없이 정답지 기준으로 채점이 계속된다.
 */
export async function preloadVocabulary(words: string[]): Promise<void> {
  const needed = [...new Set(words.map(normalizeHeadword))].filter(
    w => w !== '' && !cache.has(w)
  );
  if (needed.length === 0) return;

  for (let i = 0; i < needed.length; i += LOOKUP_CHUNK_SIZE) {
    const chunk = needed.slice(i, i + LOOKUP_CHUNK_SIZE);

    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('headword, meanings')
        .in('headword', chunk);

      if (error) throw error;

      for (const row of (data ?? []) as { headword: string; meanings: string }[]) {
        cache.set(normalizeHeadword(row.headword), row.meanings);
      }

      // 응답에 없던 표제어는 "DB에 없음"으로 기록해 재조회를 막는다
      for (const word of chunk) {
        if (!cache.has(word)) cache.set(word, '');
      }
    } catch (error) {
      console.warn('단어장 조회 실패 — 정답지에 적힌 뜻만으로 채점합니다:', error);
      return;
    }
  }
}

/**
 * 캐시된 단어장에서 표제어의 모든 뜻을 정답 후보로 분해해 반환한다.
 * preloadVocabulary 로 미리 받아둔 표제어만 조회된다 (동기 함수).
 */
export function lookupMeanings(word: string): string[] {
  if (!word) return [];

  const raw = cache.get(normalizeHeadword(word));
  if (!raw) return [];

  return parseCorrectAnswers(raw);
}

/** 테스트용 주입 */
export function __setVocabularyForTest(data: Record<string, string>): void {
  cache.clear();
  for (const [key, value] of Object.entries(data)) {
    cache.set(normalizeHeadword(key), value);
  }
}

/** 테스트용 초기화 */
export function __resetVocabularyForTest(): void {
  cache.clear();
}
