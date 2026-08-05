import { describe, it, expect, beforeEach } from 'vitest'
import {
  __setVocabularyForTest,
  lookupMeanings,
  extractEnglishHeadword,
  ensureVocabularyLoaded,
} from '../vocab-dictionary'

beforeEach(() => {
  __setVocabularyForTest({
    float: '뜨다, 떠다니다; 부유물; 자유롭게 변동하다',
    amount: '총액, 총계, 액수, 양; 총계가 ~이 되다',
    'a bit': '약간, 조금',
    conduct: '수행하다, 실시하다; 행위, 안내',
  })
})

describe('extractEnglishHeadword', () => {
  it('question이 영어면 그것을 표제어로 쓴다', () => {
    expect(extractEnglishHeadword('float', '뜨다, 떠다니다')).toBe('float')
  })

  it('여러 단어로 된 영어 표현도 표제어로 인정한다', () => {
    expect(extractEnglishHeadword('a bit', '약간')).toBe('a bit')
  })

  it('question이 한국어면(= 정답이 영어인 문항) 표제어를 쓰지 않는다', () => {
    // 정답이 영어인 문항에서는 단어장의 한국어 뜻이 학생 답안이 될 수 없다
    expect(extractEnglishHeadword('[명] 제목', 'title')).toBeNull()
  })

  it('question이 없으면 null', () => {
    expect(extractEnglishHeadword(undefined, '뜨다')).toBeNull()
  })

  it('영어 문장형 지문은 표제어로 쓰지 않는다', () => {
    expect(
      extractEnglishHeadword('Read the passage and choose the best answer for the blank', '주제')
    ).toBeNull()
  })
})

describe('lookupMeanings', () => {
  it('단어장에 있는 표제어의 모든 뜻을 후보로 반환한다', () => {
    expect(lookupMeanings('float')).toEqual([
      '뜨다',
      '떠다니다',
      '부유물',
      '자유롭게 변동하다',
    ])
  })

  it('대소문자·공백 차이를 무시하고 조회한다', () => {
    expect(lookupMeanings('  Float ')).toContain('부유물')
    expect(lookupMeanings('A Bit')).toEqual(['약간', '조금'])
  })

  it('단어장에 없으면 빈 배열', () => {
    expect(lookupMeanings('nonexistentword')).toEqual([])
  })

  it('빈 입력은 빈 배열', () => {
    expect(lookupMeanings('')).toEqual([])
  })
})

describe('실제 단어장 데이터 (lib/data/vocabulary.json)', () => {
  beforeEach(async () => {
    __setVocabularyForTest(null)
    await ensureVocabularyLoaded()
  })

  it('정답지 다의어 단어의 뜻을 조회한다', () => {
    const meanings = lookupMeanings('float')
    expect(meanings).toContain('뜨다')
    expect(meanings).toContain('부유물')
  })

  it('괄호 안 쉼표가 별도 정답으로 새어나오지 않는다', () => {
    // conduct 항목에 "(열, 소리, 진동 등을) 전달하다" 가 있다
    const meanings = lookupMeanings('conduct')
    expect(meanings).toContain('전달하다')
    expect(meanings).not.toContain('소리')
    expect(meanings).not.toContain('(열')
  })

  it('단어장에 없는 표제어는 빈 배열', () => {
    expect(lookupMeanings('zzzznotaword')).toEqual([])
  })
})
