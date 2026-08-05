/**
 * 정답지 문자열을 채점 가능한 개별 정답 후보로 분해한다.
 *
 * 배경: 어휘 시험 정답지와 단어장은 한 문항에 여러 사전 의미를 한 문자열로 담는다.
 *   예) "뜨다, 떠다니다; 부유물"  "범위; 정렬시키다"  "[명] 페인트 [동] 페인트칠하다"
 *       "동반[동행]하다"  "(열, 소리, 진동 등을) 전달하다"
 * 기존 분리 로직은 `\ / | ,` 만 구분자로 취급해 `;` 뒤의 뜻과 품사 태그가 붙은 뜻을
 * 통째로 하나의 후보로 만들었고, 그 결과 정답지에 명시된 뜻조차 로컬 매칭에서 탈락해
 * 전부 AI 시멘틱 채점으로 넘어갔다 (다의어 오답의 주요 경로).
 */

/** 뜻 구분자 — 괄호·대괄호 밖에서만 구분자로 취급한다 */
const DELIMITERS = new Set([';', ',', '/', '|', '\\']);

/**
 * 품사 태그 — 뜻과 뜻의 경계로 본다.
 * 동의어 대괄호(`동반[동행]하다`)와 구분하기 위해 알려진 품사 표기만 매칭한다.
 */
const POS_TAG_PATTERN =
  /\[(명사|동사|형용사|부사|전치사|접속사|대명사|감탄사|관사|자동사|타동사|명|동|형|부|전|접|대|감|관)\]/g;

/** 괄호 보충설명: (…) 전체 */
const PAREN_PATTERN = /\([^)]*\)/g;

/** 동의어 대괄호: 앞 어절을 대체하는 표기 */
const ALT_BRACKET_PATTERN = /^(.*?)\[([^\]]+)\](.*)$/;

/**
 * 그 자체로는 뜻이 될 수 없는 표현.
 * 괄호 보충설명을 떼어낸 뒤 어미만 남는 경우를 걸러낸다.
 * 예) "(특정한 활동을) 하다" → "하다"
 */
const GENERIC_STUBS = new Set(['하다', '되다', '시키다', '있다', '없다', '것', '함', '됨', '~하다', '~되다']);

/**
 * 괄호·대괄호 밖의 구분자에서만 문자열을 쪼갠다.
 *
 * 괄호 안 쉼표는 뜻의 경계가 아니라 보충설명의 일부다.
 * 예) "(열, 소리, 진동 등을) 전달하다" 는 뜻 하나이지 "소리" 가 정답이 되어선 안 된다.
 */
function splitOutsideParens(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of text) {
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);

    if (depth === 0 && DELIMITERS.has(char)) {
      parts.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

const collapseSpaces = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * `A[B]C` 형태의 동의어 표기를 `AC` 와 `BC` 두 후보로 펼친다.
 *
 * 단어장은 "동반[동행]하다", "관리[운영]하다", "통행 통과[횡단]하다" 처럼
 * 앞 어절을 대체하는 방식으로 동의어를 적는다. 대괄호를 단순히 지우면
 * "동반하다" 만 남고, 구분자로 취급하면 "하다" 같은 무의미한 후보가 생긴다.
 */
function expandAltBrackets(text: string): string[] {
  const match = text.match(ALT_BRACKET_PATTERN);
  if (!match) return [text];

  const [, before, alternative, after] = match;

  // (1) 대괄호를 통째로 지운 형태
  const removed = collapseSpaces(before + after);

  // (2) 앞 어절의 끝부분을 대체어로 바꾼 형태
  const trailing = before.match(/(\S+)\s*$/);
  let replaced: string;
  if (trailing) {
    const token = trailing[1];
    const head = before.slice(0, before.length - trailing[0].length);
    const stem = token.length > alternative.length ? token.slice(0, token.length - alternative.length) : '';
    replaced = collapseSpaces(head + stem + alternative + after);
  } else {
    replaced = collapseSpaces(alternative + after);
  }

  return [...expandAltBrackets(removed), ...expandAltBrackets(replaced)];
}

/**
 * 정답지 원문을 정답 후보 배열로 분해한다.
 *
 * - `; , / | \` 를 구분자로 사용 (괄호·대괄호 밖에서만). `|||` 형식도 자연히 처리된다.
 * - 품사 태그는 뜻의 경계로 보고 분해
 * - 동의어 대괄호 `A[B]C` 는 `AC` / `BC` 두 후보로 확장
 * - 괄호 보충설명이 있으면 원문과 괄호 제거형을 모두 후보에 포함
 */
export function parseCorrectAnswers(correctAnswer: string): string[] {
  if (!correctAnswer || !correctAnswer.trim()) return [];

  // 품사 태그는 뜻과 뜻의 경계이기도 하다 ("[명] 페인트 [동] 페인트칠하다") → 구분자로 치환
  const withoutPosTags = correctAnswer.replace(POS_TAG_PATTERN, ';');

  const candidates: string[] = [];

  for (const part of splitOutsideParens(withoutPosTags)) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    for (const expanded of expandAltBrackets(trimmed)) {
      if (!expanded) continue;
      candidates.push(expanded);

      // 괄호 보충설명이 있으면 괄호 밖 핵심 표현도 후보로 추가
      PAREN_PATTERN.lastIndex = 0;
      if (PAREN_PATTERN.test(expanded)) {
        const stripped = collapseSpaces(expanded.replace(PAREN_PATTERN, ' '));
        if (stripped) candidates.push(stripped);
      }
      PAREN_PATTERN.lastIndex = 0;
    }
  }

  return [...new Set(candidates)].filter(c => !GENERIC_STUBS.has(c));
}
