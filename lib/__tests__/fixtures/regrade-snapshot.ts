import type { QuestionResult } from '@/types/grading'

/**
 * 실제 채점 후 사용자가 일부 항목을 수동 수정한 50문항 스냅샷.
 * 모드 추정: lenient (이유에 "유사 의미", "품사 차이 무시"가 다수 등장).
 *
 * 용도: 동일 입력으로 lenient 모드 재채점 시의 예상 차이를 회귀 테스트로 고정.
 */
export const SNAPSHOT_RESULTS: QuestionResult[] = [
  { questionNumber: 1, question: 'account', correctAnswer: '설명, 기술', studentAnswer: '설명하다', isCorrect: true, aiReason: '의미 일치' },
  { questionNumber: 2, question: 'enhance', correctAnswer: '향상하다', studentAnswer: '향상하다', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 3, question: 'cognition', correctAnswer: '인지', studentAnswer: '인지', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 4, question: 'caution', correctAnswer: '경고하다', studentAnswer: '경고', isCorrect: true, aiReason: '품사 차이 무시' },
  { questionNumber: 5, question: 'marginalise', correctAnswer: '주변화하다', studentAnswer: '주변화하다', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 6, question: 'adapt to', correctAnswer: '~에 적응하다', studentAnswer: '~에 익숙해지다', isCorrect: true, aiReason: '유사 의미' },
  { questionNumber: 7, question: 'lock in', correctAnswer: '고정되다', studentAnswer: '잠기다', isCorrect: true, aiReason: '의미 불일치', isEdited: true },
  { questionNumber: 8, question: 'activate', correctAnswer: '활성화하다', studentAnswer: '활성화하다', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 9, question: 'coolly', correctAnswer: '냉담하게', studentAnswer: '냉담하게', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 10, question: 'abandon', correctAnswer: '폐지하다', studentAnswer: '버리다', isCorrect: true, aiReason: '유사 의미' },
  { questionNumber: 11, question: 'transit', correctAnswer: '대중교통', studentAnswer: '교통 변화하는', isCorrect: false, aiReason: '의미 불일치' },
  { questionNumber: 12, question: 'witness', correctAnswer: '목격하다', studentAnswer: '목격자', isCorrect: true, aiReason: '품사 차이 무시' },
  { questionNumber: 13, question: 'internal', correctAnswer: '내적인, 내부의', studentAnswer: '내적인', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 14, question: 'confidence', correctAnswer: '자신감', studentAnswer: '자신감', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 15, question: 'device', correctAnswer: '기기', studentAnswer: '장치', isCorrect: true, aiReason: '유사 의미' },
  { questionNumber: 16, question: 'signify', correctAnswer: '의미하다', studentAnswer: '중요하다', isCorrect: true, aiReason: '의미 불일치', isEdited: true },
  { questionNumber: 17, question: 'earbud', correctAnswer: '이어버드(귀 안에 넣는 이어폰)', studentAnswer: '이어버드', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 18, question: 'conventional', correctAnswer: '전통적인', studentAnswer: '전통적인', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 19, question: 'locate', correctAnswer: '찾다', studentAnswer: '위치하다', isCorrect: true, aiReason: '의미 불일치', isEdited: true },
  { questionNumber: 20, question: 'accommodation', correctAnswer: '숙박', studentAnswer: '숙박시설', isCorrect: true, aiReason: '유사 의미' },
  { questionNumber: 21, question: 'transition', correctAnswer: '전환', studentAnswer: '변화', isCorrect: true, aiReason: '유사 의미' },
  { questionNumber: 22, question: 'representation', correctAnswer: '표상', studentAnswer: '대표', isCorrect: true, aiReason: '의미 불일치', isEdited: true },
  { questionNumber: 23, question: 'commercialization', correctAnswer: '상업화', studentAnswer: '상업화', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 24, question: 'unintentionally', correctAnswer: '의도하지 않게', studentAnswer: '의도하지않게', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 25, question: 'tie', correctAnswer: '(강한) 유대 [관계]', studentAnswer: '묶다', isCorrect: true, aiReason: '의미 불일치', isEdited: true },
  { questionNumber: 26, question: 'illustrate', correctAnswer: '설명하다', studentAnswer: '묘사하다', isCorrect: true, aiReason: '유사 의미' },
  { questionNumber: 27, question: 'formulation', correctAnswer: '공식화', studentAnswer: '공식화', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 28, question: 'foster', correctAnswer: '조성하다', studentAnswer: '기르다', isCorrect: true, aiReason: '유사 의미' },
  { questionNumber: 29, question: 'specific', correctAnswer: '특정한', studentAnswer: '특정하다', isCorrect: true, aiReason: '품사 차이 무시' },
  { questionNumber: 30, question: 'outrage', correctAnswer: '분노', studentAnswer: '분노', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 31, question: 'inclined to do', correctAnswer: '~하는 경향이 있는', studentAnswer: '~하길 선호하다', isCorrect: false, aiReason: '의미 불일치' },
  { questionNumber: 32, question: 'numerical', correctAnswer: '수치적인, 숫자와 관련된', studentAnswer: '수치적인', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 33, question: 'alternative', correctAnswer: '대안의', studentAnswer: '대안적인', isCorrect: true, aiReason: '유사 의미' },
  { questionNumber: 34, question: 'GPS', correctAnswer: '위성 위치 확인 시스템', studentAnswer: 'GPS', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 35, question: 'accompany', correctAnswer: '(~의) 반주를 하다', studentAnswer: '반주하다', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 36, question: 'obtain', correctAnswer: '얻다', studentAnswer: '얻다', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 37, question: 'reflection', correctAnswer: '성찰', studentAnswer: '반성', isCorrect: true, aiReason: '의미 불일치', isEdited: true },
  { questionNumber: 38, question: 'cognitive psychology', correctAnswer: '인지 심리학', studentAnswer: '인지 심리학', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 39, question: 'highlight', correctAnswer: '부각[강조]하다', studentAnswer: '강조하다', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 40, question: 'cumulative', correctAnswer: '누적된', studentAnswer: '계산적인', isCorrect: false, aiReason: '의미 불일치' },
  { questionNumber: 41, question: 'potentially', correctAnswer: '잠재적으로', studentAnswer: '잠재적으로', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 42, question: 'occasionally', correctAnswer: '때때로', studentAnswer: '가끔', isCorrect: true, aiReason: '유사 의미' },
  { questionNumber: 43, question: 'justify', correctAnswer: '정당화하다', studentAnswer: '정의하다', isCorrect: false, aiReason: '의미 불일치' },
  { questionNumber: 44, question: 'via', correctAnswer: '~을 통하여', studentAnswer: '~를 통해', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 45, question: 'escape', correctAnswer: '도피', studentAnswer: '탈출하다', isCorrect: true, aiReason: '품사 차이 무시' },
  { questionNumber: 46, question: 'embody', correctAnswer: '구현하다, 나타내다', studentAnswer: '구현하다', isCorrect: true, aiReason: '정답 일치' },
  { questionNumber: 47, question: 'monetary', correctAnswer: '금전적인', studentAnswer: '돈위주의', isCorrect: true, aiReason: '유사 의미' },
  { questionNumber: 48, question: 'ecological', correctAnswer: '생태의', studentAnswer: '생태적으로', isCorrect: true, aiReason: '품사 차이 무시' },
  { questionNumber: 49, question: 'authority', correctAnswer: '권한', studentAnswer: '관객,', isCorrect: false, aiReason: '의미 불일치' },
  { questionNumber: 50, question: 'cast aside', correctAnswer: '~을 버리다, 제쳐 놓다', studentAnswer: '옆으로 치우다', isCorrect: true, aiReason: '유사 의미' },
]

/**
 * lenient 모드 채점 케이스 분류.
 *
 * - 'exact': 정규화 후 정확 일치
 * - 'pos-variant': 같은 어근이지만 품사가 다름 (예: 경고하다/경고)
 * - 'parenthetical': 정답에 괄호·대괄호 보충설명 포함
 * - 'plural-answer': 정답이 쉼표·||| 로 복수 정답
 * - 'dict-translation': 정답과 다른 단어지만 영한/한영 사전에 등재된 번역어 (다의어 포함)
 * - 'similar-meaning': 사전 번역어는 아니지만 같은 의미장(semantic field)에서 의미가 통하는 표현 ← 핵심 완화 대상
 * - 'wrong': 다른 영단어의 번역어이거나 무관한 개념 (오답 유지)
 */
export type RegradeCategory =
  | 'exact'
  | 'pos-variant'
  | 'parenthetical'
  | 'plural-answer'
  | 'dict-translation'
  | 'similar-meaning'
  | 'wrong'

/**
 * lenient 모드 재채점 시 예상되는 결과 (목표).
 *
 * 회귀 테스트는 이 예상치를 mock AI 응답으로 사용한다.
 */
export type ExpectedRegrade = {
  questionNumber: number
  isCorrect: boolean
  reason: string
  /** 스냅샷 대비 isCorrect 변동 여부 ('keep' | 'flip-to-correct' | 'flip-to-incorrect') */
  diff: 'keep' | 'flip-to-correct' | 'flip-to-incorrect'
  category: RegradeCategory
}

export const EXPECTED_REGRADE: ExpectedRegrade[] = [
  { questionNumber: 1, isCorrect: true, reason: '사전 번역어 (account: 설명)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 2, isCorrect: true, reason: '정답 일치', diff: 'keep', category: 'exact' },
  { questionNumber: 3, isCorrect: true, reason: '정답 일치', diff: 'keep', category: 'exact' },
  { questionNumber: 4, isCorrect: true, reason: '품사 차이 무시', diff: 'keep', category: 'pos-variant' },
  { questionNumber: 5, isCorrect: true, reason: '정답 일치', diff: 'keep', category: 'exact' },
  { questionNumber: 6, isCorrect: true, reason: 'adapt to의 유의 표현 (~에 익숙해지다)', diff: 'keep', category: 'similar-meaning' },
  { questionNumber: 7, isCorrect: true, reason: 'lock의 사전 번역어 (잠그다/잠기다)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 8, isCorrect: true, reason: '정답 일치', diff: 'keep', category: 'exact' },
  { questionNumber: 9, isCorrect: true, reason: '정답 일치', diff: 'keep', category: 'exact' },
  { questionNumber: 10, isCorrect: true, reason: 'abandon의 사전 번역어 (버리다)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 11, isCorrect: false, reason: '의미 불일치', diff: 'keep', category: 'wrong' },
  { questionNumber: 12, isCorrect: true, reason: 'witness의 사전 번역어 (목격자)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 13, isCorrect: true, reason: '복수 정답 중 일치', diff: 'keep', category: 'plural-answer' },
  { questionNumber: 14, isCorrect: true, reason: '정답 일치', diff: 'keep', category: 'exact' },
  { questionNumber: 15, isCorrect: true, reason: 'device의 사전 번역어 (장치)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 16, isCorrect: true, reason: 'signify의 자동사 의미 (중요하다)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 17, isCorrect: true, reason: '괄호 보충설명', diff: 'keep', category: 'parenthetical' },
  { questionNumber: 18, isCorrect: true, reason: '정답 일치', diff: 'keep', category: 'exact' },
  { questionNumber: 19, isCorrect: true, reason: 'locate의 자동사 의미 (위치하다)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 20, isCorrect: true, reason: 'accommodation의 사전 번역어 (숙박시설)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 21, isCorrect: true, reason: 'transition의 사전 번역어 (변화)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 22, isCorrect: true, reason: 'representation의 사전 번역어 (대표)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 23, isCorrect: true, reason: '정답 일치', diff: 'keep', category: 'exact' },
  { questionNumber: 24, isCorrect: true, reason: '띄어쓰기 차이 무시', diff: 'keep', category: 'exact' },
  { questionNumber: 25, isCorrect: true, reason: 'tie의 다의어 (묶다)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 26, isCorrect: true, reason: 'illustrate의 사전 번역어 (묘사하다)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 27, isCorrect: true, reason: '정답 일치', diff: 'keep', category: 'exact' },
  { questionNumber: 28, isCorrect: true, reason: 'foster의 사전 번역어 (기르다)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 29, isCorrect: true, reason: '품사 차이 무시', diff: 'keep', category: 'pos-variant' },
  { questionNumber: 30, isCorrect: true, reason: '정답 일치', diff: 'keep', category: 'exact' },
  { questionNumber: 31, isCorrect: false, reason: '선호하다는 prefer의 번역어', diff: 'keep', category: 'wrong' },
  { questionNumber: 32, isCorrect: true, reason: '복수 정답 중 일치', diff: 'keep', category: 'plural-answer' },
  { questionNumber: 33, isCorrect: true, reason: '표현 차이', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 34, isCorrect: true, reason: 'GPS는 한국어에서도 사전 등재', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 35, isCorrect: true, reason: '괄호 보충설명', diff: 'keep', category: 'parenthetical' },
  { questionNumber: 36, isCorrect: true, reason: '정답 일치', diff: 'keep', category: 'exact' },
  { questionNumber: 37, isCorrect: true, reason: 'reflection의 사전 번역어 (반성)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 38, isCorrect: true, reason: '정답 일치', diff: 'keep', category: 'exact' },
  { questionNumber: 39, isCorrect: true, reason: '대괄호 보충설명', diff: 'keep', category: 'parenthetical' },
  { questionNumber: 40, isCorrect: false, reason: '계산적인은 calculating의 번역어', diff: 'keep', category: 'wrong' },
  { questionNumber: 41, isCorrect: true, reason: '정답 일치', diff: 'keep', category: 'exact' },
  { questionNumber: 42, isCorrect: true, reason: 'occasionally의 사전 번역어 (가끔)', diff: 'keep', category: 'dict-translation' },
  { questionNumber: 43, isCorrect: false, reason: '정의하다는 define의 번역어', diff: 'keep', category: 'wrong' },
  { questionNumber: 44, isCorrect: true, reason: '표현 차이', diff: 'keep', category: 'exact' },
  { questionNumber: 45, isCorrect: true, reason: '품사 차이 무시', diff: 'keep', category: 'pos-variant' },
  { questionNumber: 46, isCorrect: true, reason: '복수 정답 중 일치', diff: 'keep', category: 'plural-answer' },
  { questionNumber: 47, isCorrect: true, reason: 'monetary의 의미 포함 (돈 위주)', diff: 'keep', category: 'similar-meaning' },
  { questionNumber: 48, isCorrect: true, reason: '품사 차이 무시', diff: 'keep', category: 'pos-variant' },
  { questionNumber: 49, isCorrect: false, reason: '관객은 audience의 번역어', diff: 'keep', category: 'wrong' },
  { questionNumber: 50, isCorrect: true, reason: 'cast aside의 사전 번역어 (제쳐 놓다)', diff: 'keep', category: 'similar-meaning' },
]
