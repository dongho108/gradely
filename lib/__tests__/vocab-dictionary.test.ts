import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock supabase
const mockIn = vi.fn()
const mockSelect = vi.fn(() => ({ in: mockIn }))
const mockFrom = vi.fn(() => ({ select: mockSelect }))
vi.mock('../supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...(args as [])),
  },
}))

import {
  __setVocabularyForTest,
  __resetVocabularyForTest,
  lookupMeanings,
  extractEnglishHeadword,
  preloadVocabulary,
  isEnglishPhrase,
  hasHangul,
} from '../vocab-dictionary'

beforeEach(() => {
  mockFrom.mockClear()
  mockSelect.mockClear()
  mockIn.mockReset()
  __resetVocabularyForTest()
})

describe('extractEnglishHeadword', () => {
  it('question이 영어면 그것을 표제어로 쓴다', () => {
    expect(extractEnglishHeadword('float', '뜨다, 떠다니다')).toBe('float')
  })

  it('여러 단어로 된 영어 표현도 표제어로 인정한다', () => {
    expect(extractEnglishHeadword('a bit', '약간')).toBe('a bit')
  })

  it('question이 한국어면(= 정답이 영어인 문항) 표제어를 쓰지 않는다', () => {
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

describe('isEnglishPhrase / hasHangul', () => {
  it('영어 단어·숙어를 구분한다', () => {
    expect(isEnglishPhrase('title')).toBe(true)
    expect(isEnglishPhrase('a bit')).toBe(true)
    expect(isEnglishPhrase('제목')).toBe(false)
  })

  it('한글 포함 여부를 판단한다', () => {
    expect(hasHangul('[명] 제목')).toBe(true)
    expect(hasHangul('title')).toBe(false)
  })
})

describe('preloadVocabulary', () => {
  it('필요한 표제어만 조회해 캐시에 담는다', async () => {
    mockIn.mockResolvedValue({
      data: [
        { headword: 'float', meanings: '뜨다, 떠다니다; 부유물' },
        { headword: 'conduct', meanings: '수행하다; 지휘하다' },
      ],
      error: null,
    })

    await preloadVocabulary(['float', 'conduct'])

    expect(mockFrom).toHaveBeenCalledWith('SL_VOCA_DB')
    expect(mockIn).toHaveBeenCalledWith('headword', ['float', 'conduct'])
    expect(lookupMeanings('float')).toEqual(['뜨다', '떠다니다', '부유물'])
    expect(lookupMeanings('conduct')).toEqual(['수행하다', '지휘하다'])
  })

  it('표제어를 정규화해서 조회한다 (대소문자·공백)', async () => {
    mockIn.mockResolvedValue({ data: [], error: null })

    await preloadVocabulary(['  Float ', 'A  Bit'])

    expect(mockIn).toHaveBeenCalledWith('headword', ['float', 'a bit'])
  })

  it('중복 표제어는 한 번만 조회한다', async () => {
    mockIn.mockResolvedValue({ data: [], error: null })

    await preloadVocabulary(['float', 'Float', 'float '])

    expect(mockIn).toHaveBeenCalledWith('headword', ['float'])
  })

  it('이미 캐시된 표제어는 다시 조회하지 않는다', async () => {
    mockIn.mockResolvedValue({
      data: [{ headword: 'float', meanings: '뜨다' }],
      error: null,
    })
    await preloadVocabulary(['float'])
    expect(mockIn).toHaveBeenCalledTimes(1)

    await preloadVocabulary(['float'])
    expect(mockIn).toHaveBeenCalledTimes(1)
  })

  it('DB에 없는 표제어도 캐시에 기록해 재조회를 막는다', async () => {
    mockIn.mockResolvedValue({ data: [], error: null })

    await preloadVocabulary(['unknownword'])
    await preloadVocabulary(['unknownword'])

    expect(mockIn).toHaveBeenCalledTimes(1)
    expect(lookupMeanings('unknownword')).toEqual([])
  })

  it('표제어가 많으면 여러 번에 나눠 조회한다', async () => {
    mockIn.mockResolvedValue({ data: [], error: null })

    const many = Array.from({ length: 250 }, (_, i) => `word${i}`)
    await preloadVocabulary(many)

    expect(mockIn).toHaveBeenCalledTimes(2)
    expect(mockIn.mock.calls[0][1]).toHaveLength(200)
    expect(mockIn.mock.calls[1][1]).toHaveLength(50)
  })

  it('조회 실패해도 예외를 던지지 않는다 (채점은 정답지 기준으로 계속)', async () => {
    mockIn.mockResolvedValue({ data: null, error: new Error('network down') })

    await expect(preloadVocabulary(['float'])).resolves.toBeUndefined()
    expect(lookupMeanings('float')).toEqual([])
  })

  it('빈 목록이면 조회하지 않는다', async () => {
    await preloadVocabulary([])
    expect(mockIn).not.toHaveBeenCalled()
  })
})

describe('lookupMeanings', () => {
  beforeEach(() => {
    __setVocabularyForTest({
      float: '뜨다, 떠다니다; 부유물; 자유롭게 변동하다',
      'a bit': '약간, 조금',
    })
  })

  it('캐시된 표제어의 모든 뜻을 후보로 반환한다', () => {
    expect(lookupMeanings('float')).toEqual(['뜨다', '떠다니다', '부유물', '자유롭게 변동하다'])
  })

  it('대소문자·공백 차이를 무시하고 조회한다', () => {
    expect(lookupMeanings('  Float ')).toContain('부유물')
    expect(lookupMeanings('A Bit')).toEqual(['약간', '조금'])
  })

  it('캐시에 없으면 빈 배열', () => {
    expect(lookupMeanings('nonexistentword')).toEqual([])
  })

  it('빈 입력은 빈 배열', () => {
    expect(lookupMeanings('')).toEqual([])
  })
})
