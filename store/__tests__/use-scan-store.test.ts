import { describe, it, expect, beforeEach } from 'vitest'
import { useScanStore } from '../use-scan-store'
import type { AnswerKeyEntry, ScannedPage } from '@/types'

function makeAnswerKey(id: string): AnswerKeyEntry {
  return {
    id,
    title: `시험 ${id}`,
    files: [new File([], 'test.pdf')],
    structure: { title: `시험 ${id}`, answers: {}, totalQuestions: 10 },
    createdAt: Date.now(),
  }
}

function makePage(id: string): ScannedPage {
  return {
    id,
    file: new File([], `${id}.png`),
  }
}

describe('useScanStore', () => {
  beforeEach(() => {
    useScanStore.getState().resetSession()
    useScanStore.setState({ answerKeys: [] })
  })

  describe('초기 상태', () => {
    it('answerKeys 빈 배열', () => {
      expect(useScanStore.getState().answerKeys).toEqual([])
    })

    it('isScanWorkflowOpen false', () => {
      expect(useScanStore.getState().isScanWorkflowOpen).toBe(false)
    })

    it('activeScanSession null', () => {
      expect(useScanStore.getState().activeScanSession).toBeNull()
    })
  })

  describe('addAnswerKey', () => {
    it('정답지 추가 → answerKeys에 포함', () => {
      const key = makeAnswerKey('a1')
      useScanStore.getState().addAnswerKey(key)
      expect(useScanStore.getState().answerKeys).toHaveLength(1)
      expect(useScanStore.getState().answerKeys[0].id).toBe('a1')
    })

    it('중복 id → 덮어쓰기', () => {
      const key1 = makeAnswerKey('a1')
      const key2 = { ...makeAnswerKey('a1'), title: '업데이트됨' }
      useScanStore.getState().addAnswerKey(key1)
      useScanStore.getState().addAnswerKey(key2)
      expect(useScanStore.getState().answerKeys).toHaveLength(1)
      expect(useScanStore.getState().answerKeys[0].title).toBe('업데이트됨')
    })
  })

  describe('removeAnswerKey', () => {
    it('id로 삭제 → answerKeys에서 제거', () => {
      const key = makeAnswerKey('a1')
      useScanStore.getState().addAnswerKey(key)
      useScanStore.getState().removeAnswerKey('a1')
      expect(useScanStore.getState().answerKeys).toHaveLength(0)
    })

    it('존재하지 않는 id → 에러 없이 무시', () => {
      useScanStore.getState().removeAnswerKey('nonexistent')
      expect(useScanStore.getState().answerKeys).toHaveLength(0)
    })
  })

  describe('openWorkflow / closeWorkflow', () => {
    it('openWorkflow → isScanWorkflowOpen true', () => {
      useScanStore.getState().openWorkflow()
      expect(useScanStore.getState().isScanWorkflowOpen).toBe(true)
    })

    it('closeWorkflow → isScanWorkflowOpen false', () => {
      useScanStore.getState().openWorkflow()
      useScanStore.getState().closeWorkflow()
      expect(useScanStore.getState().isScanWorkflowOpen).toBe(false)
    })
  })

  describe('addScannedPage', () => {
    it('페이지 추가 → scannedPages에 포함', () => {
      const page = makePage('p1')
      useScanStore.getState().addScannedPage(page)
      expect(useScanStore.getState().scannedPages).toHaveLength(1)
    })

    it('pageCount 증가 확인', () => {
      useScanStore.getState().addScannedPage(makePage('p1'))
      useScanStore.getState().addScannedPage(makePage('p2'))
      expect(useScanStore.getState().scannedPages).toHaveLength(2)
    })
  })

  describe('resetSession', () => {
    it('모든 스캔 관련 상태 초기화', () => {
      useScanStore.getState().openWorkflow()
      useScanStore.getState().addScannedPage(makePage('p1'))
      useScanStore.getState().resetSession()
      expect(useScanStore.getState().isScanWorkflowOpen).toBe(false)
      expect(useScanStore.getState().scannedPages).toHaveLength(0)
      expect(useScanStore.getState().classifiedStudents).toHaveLength(0)
    })

    it('answerKeys는 유지됨', () => {
      const key = makeAnswerKey('a1')
      useScanStore.getState().addAnswerKey(key)
      useScanStore.getState().resetSession()
      expect(useScanStore.getState().answerKeys).toHaveLength(1)
    })
  })
})
