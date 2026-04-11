import { describe, it, expect, beforeEach } from 'vitest'
import { useTabStore } from '../use-tab-store'
import type { ClassifiedStudent, AnswerKeyEntry } from '@/types'
import type { StudentExamStructure } from '@/types/grading'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockFile(name: string): File {
  return new File(['test'], name, { type: 'application/pdf' })
}

function createAnswerKey(id: string, title: string): AnswerKeyEntry {
  return {
    id,
    title,
    files: [createMockFile(`${title}.pdf`)],
    structure: {
      title,
      answers: { '1': { text: 'A' }, '2': { text: 'B' }, '3': { text: 'C' } },
      totalQuestions: 3,
    },
    createdAt: Date.now(),
  }
}

function createStudent(
  name: string,
  examTitle: string,
  answerKeyId: string,
  className?: string,
): ClassifiedStudent {
  return {
    name,
    className,
    examTitle,
    pages: [{ id: `page-${name}`, file: createMockFile(`${name}.pdf`) }],
    answerKeyId,
  }
}

function createStudentWithOcrResult(
  name: string,
  examTitle: string,
  answerKeyId: string,
  ocrResult: StudentExamStructure,
  className?: string,
): ClassifiedStudent {
  return {
    name,
    className,
    examTitle,
    pages: [{ id: `page-${name}`, file: createMockFile(`${name}.pdf`), ocrResult }],
    answerKeyId,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('addTabFromScan', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null, submissions: {} })
  })

  // -------------------------------------------------------------------------
  // 단일 시험 커밋
  // -------------------------------------------------------------------------
  describe('단일 시험 커밋', () => {
    it('1개 시험 + 3명 학생 → 탭 1개 생성', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students = [
        createStudent('김민준', '수학 기말고사', 'ak1', '1반'),
        createStudent('이서연', '수학 기말고사', 'ak1', '1반'),
        createStudent('박지호', '수학 기말고사', 'ak1', '1반'),
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(1)
    })

    it('탭 title이 시험제목과 일치', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students = [createStudent('김민준', '수학 기말고사', 'ak1', '2반')]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].title).toBe('수학 기말고사')
    })

    it('탭 status가 ready', () => {
      const answerKeys = [createAnswerKey('ak1', '영어 중간고사')]
      const students = [createStudent('최유진', '영어 중간고사', 'ak1', '3반')]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].status).toBe('ready')
    })

    it('학생 3명이 모두 queued 상태로 submissions에 등록', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students = [
        createStudent('김민준', '수학 기말고사', 'ak1', '1반'),
        createStudent('이서연', '수학 기말고사', 'ak1', '1반'),
        createStudent('박지호', '수학 기말고사', 'ak1', '1반'),
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs, submissions } = useTabStore.getState()
      const tabId = tabs[0].id
      const subs = submissions[tabId]

      expect(subs).toHaveLength(3)
      expect(subs.every(s => s.status === 'queued')).toBe(true)
    })

    it('submissions에 학생 이름이 올바르게 저장됨', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students = [
        createStudent('김민준', '수학 기말고사', 'ak1', '1반'),
        createStudent('이서연', '수학 기말고사', 'ak1', '1반'),
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs, submissions } = useTabStore.getState()
      const names = submissions[tabs[0].id].map(s => s.studentName)
      expect(names).toContain('김민준')
      expect(names).toContain('이서연')
    })
  })

  // -------------------------------------------------------------------------
  // 복수 시험 커밋
  // -------------------------------------------------------------------------
  describe('복수 시험 커밋', () => {
    it('2개 시험(수학/영어) × 1개 반 → 탭 2개 생성', () => {
      const answerKeys = [
        createAnswerKey('ak-math', '수학 기말고사'),
        createAnswerKey('ak-eng', '영어 중간고사'),
      ]
      const students = [
        createStudent('김민준', '수학 기말고사', 'ak-math', '1반'),
        createStudent('이서연', '영어 중간고사', 'ak-eng', '1반'),
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(2)
    })

    it('1개 시험 × 2개 반(1반/2반) → examTitle 기준 탭 1개 생성', () => {
      const answerKeys = [createAnswerKey('ak1', '과학 기말고사')]
      const students = [
        createStudent('김민준', '과학 기말고사', 'ak1', '1반'),
        createStudent('이서연', '과학 기말고사', 'ak1', '2반'),
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(1)
      expect(tabs[0].title).toBe('과학 기말고사')
    })

    it('2개 시험 × 2개 반 → examTitle 기준 탭 2개 생성', () => {
      const answerKeys = [
        createAnswerKey('ak-math', '수학 기말고사'),
        createAnswerKey('ak-eng', '영어 중간고사'),
      ]
      const students = [
        createStudent('김민준', '수학 기말고사', 'ak-math', '1반'),
        createStudent('이서연', '수학 기말고사', 'ak-math', '2반'),
        createStudent('박지호', '영어 중간고사', 'ak-eng', '1반'),
        createStudent('최유진', '영어 중간고사', 'ak-eng', '2반'),
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(2)
    })

    it('2개 시험 → 각 탭이 올바른 학생을 소유', () => {
      const answerKeys = [
        createAnswerKey('ak-math', '수학 기말고사'),
        createAnswerKey('ak-eng', '영어 중간고사'),
      ]
      const students = [
        createStudent('김민준', '수학 기말고사', 'ak-math', '1반'),
        createStudent('이서연', '수학 기말고사', 'ak-math', '1반'),
        createStudent('박지호', '수학 기말고사', 'ak-math', '2반'),
        createStudent('최유진', '영어 중간고사', 'ak-eng', '2반'),
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs, submissions } = useTabStore.getState()

      const mathTab = tabs.find(t => t.title === '수학 기말고사')
      const engTab = tabs.find(t => t.title === '영어 중간고사')

      expect(submissions[mathTab!.id]).toHaveLength(3)
      expect(submissions[engTab!.id]).toHaveLength(1)
    })
  })

  // -------------------------------------------------------------------------
  // answerKey 연결
  // -------------------------------------------------------------------------
  describe('answerKey 연결', () => {
    it('각 탭에 올바른 answerKeyStructure 설정됨', () => {
      const mathKey = createAnswerKey('ak-math', '수학 기말고사')
      const engKey = createAnswerKey('ak-eng', '영어 중간고사')
      const answerKeys = [mathKey, engKey]
      const students = [
        createStudent('김민준', '수학 기말고사', 'ak-math', '1반'),
        createStudent('이서연', '영어 중간고사', 'ak-eng', '1반'),
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      const mathTab = tabs.find(t => t.title === '수학 기말고사')
      const engTab = tabs.find(t => t.title === '영어 중간고사')

      expect(mathTab?.answerKeyStructure?.title).toBe('수학 기말고사')
      expect(engTab?.answerKeyStructure?.title).toBe('영어 중간고사')
    })

    it('각 탭에 올바른 answerKeyFile 설정됨', () => {
      const mathKey = createAnswerKey('ak-math', '수학 기말고사')
      const answerKeys = [mathKey]
      const students = [createStudent('김민준', '수학 기말고사', 'ak-math', '1반')]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      const tab = tabs[0]

      expect(tab.answerKeyFile?.name).toBe('수학 기말고사.pdf')
      expect(tab.answerKeyFile?.fileRefs).toEqual(mathKey.files)
    })

    it('answerKeyStructure에 answers와 totalQuestions가 올바르게 설정됨', () => {
      const key = createAnswerKey('ak1', '국어 기말고사')
      const answerKeys = [key]
      const students = [createStudent('박지호', '국어 기말고사', 'ak1', '1반')]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      const structure = tabs[0].answerKeyStructure

      expect(structure?.totalQuestions).toBe(3)
      expect(structure?.answers['1'].text).toBe('A')
      expect(structure?.answers['2'].text).toBe('B')
      expect(structure?.answers['3'].text).toBe('C')
    })
  })

  // -------------------------------------------------------------------------
  // activeTabId
  // -------------------------------------------------------------------------
  describe('activeTabId', () => {
    it('첫 번째로 생성된 탭이 activeTabId가 됨', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students = [
        createStudent('김민준', '수학 기말고사', 'ak1', '1반'),
        createStudent('이서연', '수학 기말고사', 'ak1', '2반'),
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs, activeTabId } = useTabStore.getState()
      expect(activeTabId).toBe(tabs[0].id)
    })

    it('기존 탭이 있을 때 addTabFromScan → activeTabId가 새 첫 탭으로 업데이트됨', () => {
      // 먼저 기존 탭 추가
      useTabStore.getState().addTab()
      const existingTabId = useTabStore.getState().activeTabId

      const answerKeys = [createAnswerKey('ak1', '영어 중간고사')]
      const students = [createStudent('최유진', '영어 중간고사', 'ak1', '1반')]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs, activeTabId } = useTabStore.getState()
      const newTab = tabs.find(t => t.title === '영어 중간고사')

      expect(activeTabId).toBe(newTab?.id)
      expect(activeTabId).not.toBe(existingTabId)
    })
  })

  // -------------------------------------------------------------------------
  // 반환값 (탭 생성 수)
  // -------------------------------------------------------------------------
  describe('반환값', () => {
    it('정상 데이터 → 생성된 탭 수를 반환', () => {
      const answerKeys = [
        createAnswerKey('ak-math', '수학 기말고사'),
        createAnswerKey('ak-eng', '영어 중간고사'),
      ]
      const students = [
        createStudent('김민준', '수학 기말고사', 'ak-math', '1반'),
        createStudent('이서연', '영어 중간고사', 'ak-eng', '1반'),
      ]

      const result = useTabStore.getState().addTabFromScan({ students, answerKeys })
      expect(result).toBe(2)
    })

    it('모든 학생이 스킵되면 0을 반환', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students: ClassifiedStudent[] = [
        { name: '', className: '1반', examTitle: '수학 기말고사', pages: [], answerKeyId: 'ak1' },
      ]

      const result = useTabStore.getState().addTabFromScan({ students, answerKeys })
      expect(result).toBe(0)
    })

    it('학생 0명 → 0을 반환', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students: ClassifiedStudent[] = []

      const result = useTabStore.getState().addTabFromScan({ students, answerKeys })
      expect(result).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------
  describe('Edge Cases', () => {
    it('학생 0명 → 탭 생성 안 됨', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students: ClassifiedStudent[] = []

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(0)
    })

    it('className이 없는 학생 → 미지정 그룹으로 묶임', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students = [
        createStudent('김민준', '수학 기말고사', 'ak1'),  // className undefined
        createStudent('이서연', '수학 기말고사', 'ak1'),
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(1)
      expect(tabs[0].title).toBe('수학 기말고사')  // 미지정이면 examTitle만 사용
    })

    it('className이 없는 학생과 있는 학생이 섞이면 → 같은 examTitle이므로 1개 탭 생성', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students = [
        createStudent('김민준', '수학 기말고사', 'ak1'),        // 미지정
        createStudent('이서연', '수학 기말고사', 'ak1', '1반'), // 1반
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(1)
    })

    it('name이 빈 학생 → 스킵됨', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students: ClassifiedStudent[] = [
        { name: '', className: '1반', examTitle: '수학 기말고사', pages: [], answerKeyId: 'ak1' },
        createStudent('김민준', '수학 기말고사', 'ak1', '1반'),
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs, submissions } = useTabStore.getState()
      expect(tabs).toHaveLength(1)
      expect(submissions[tabs[0].id]).toHaveLength(1)
      expect(submissions[tabs[0].id][0].studentName).toBe('김민준')
    })

    it('examTitle이 빈 학생 → 스킵됨', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students: ClassifiedStudent[] = [
        { name: '김민준', className: '1반', examTitle: '', pages: [], answerKeyId: 'ak1' },
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(0)
    })

    it('answerKeyId가 빈 학생 → 스킵됨', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students: ClassifiedStudent[] = [
        { name: '김민준', className: '1반', examTitle: '수학 기말고사', pages: [], answerKeyId: '' },
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(0)
    })

    it('매칭되는 answerKey가 없는 학생 → 탭 생성 안 됨', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students = [
        createStudent('김민준', '수학 기말고사', 'ak-nonexistent', '1반'),
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(0)
    })

    it('answerKeys 빈 배열 → 탭 생성 안 됨', () => {
      const answerKeys: AnswerKeyEntry[] = []
      const students = [createStudent('김민준', '수학 기말고사', 'ak1', '1반')]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(0)
    })

    it('ocrResult가 있는 학생 → submission에 preExtractedStructure가 설정됨', () => {
      const ocrResult: StudentExamStructure = {
        studentName: '김민준',
        answers: { '1': 'A', '2': 'B' },
        totalQuestions: 2,
      }
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students = [
        createStudentWithOcrResult('김민준', '수학 기말고사', 'ak1', ocrResult, '1반'),
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs, submissions } = useTabStore.getState()
      const sub = submissions[tabs[0].id][0]
      expect(sub.preExtractedStructure).toEqual(ocrResult)
    })

    it('ocrResult가 없는 학생 → submission의 preExtractedStructure가 undefined', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students = [createStudent('이서연', '수학 기말고사', 'ak1', '1반')]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs, submissions } = useTabStore.getState()
      const sub = submissions[tabs[0].id][0]
      expect(sub.preExtractedStructure).toBeUndefined()
    })

    it('같은 학생이 여러 반에 걸쳐 있으면 같은 examTitle 탭에 모두 등록', () => {
      const answerKeys = [createAnswerKey('ak1', '수학 기말고사')]
      const students = [
        createStudent('김민준', '수학 기말고사', 'ak1', '1반'),
        createStudent('김민준', '수학 기말고사', 'ak1', '2반'),
      ]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs, submissions } = useTabStore.getState()
      expect(tabs).toHaveLength(1)
      expect(submissions[tabs[0].id]).toHaveLength(2)
      expect(submissions[tabs[0].id].every(s => s.studentName === '김민준')).toBe(true)
    })

    it('addTabFromScan 호출 후 기존 탭이 유지됨', () => {
      useTabStore.getState().addTab()
      useTabStore.getState().addTab()
      expect(useTabStore.getState().tabs).toHaveLength(2)

      const answerKeys = [createAnswerKey('ak1', '영어 중간고사')]
      const students = [createStudent('이서연', '영어 중간고사', 'ak1', '2반')]

      useTabStore.getState().addTabFromScan({ students, answerKeys })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(3)
    })
  })
})
