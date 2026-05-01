import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { useTabStore } from '@/store/use-tab-store';
import type { AnswerKeyStructure } from '@/types/grading';
import { ExamRail } from '../exam-rail';

vi.mock('../new-exam-scan-button', () => ({
  NewExamScanButton: () => <div data-testid="new-exam-stub" />,
}));

vi.mock('@/lib/persistence-service', () => ({
  archiveSession: vi.fn(async () => {}),
}));

const filesToImagesMock = vi.fn(async (_files: File[]) => ['data:image/jpeg;base64,X']);
const extractAnswerStructureMock = vi.fn<
  (images: string[]) => Promise<AnswerKeyStructure>
>();

vi.mock('@/lib/file-utils', () => ({
  filesToImages: (files: File[]) => filesToImagesMock(files),
}));

vi.mock('@/lib/grading-service', () => ({
  extractAnswerStructureFromImages: (images: string[]) =>
    extractAnswerStructureMock(images),
}));

vi.mock('@/store/use-auth-store', () => ({
  useAuthStore: Object.assign(() => null, {
    getState: () => ({ user: null }),
  }),
}));

function makeFile(name: string, type: string): File {
  return new File(['dummy'], name, { type });
}

function makeDataTransfer(files: File[]): DataTransfer {
  return {
    files: Object.assign(files, {
      item: (i: number) => files[i] ?? null,
      length: files.length,
    }) as unknown as FileList,
    types: ['Files'],
    items: [],
    dropEffect: 'copy',
    effectAllowed: 'all',
    clearData: () => {},
    getData: () => '',
    setData: () => {},
    setDragImage: () => {},
  } as unknown as DataTransfer;
}

function structure(title: string, total = 5): AnswerKeyStructure {
  return { title, answers: { '1': { text: 'A' } }, totalQuestions: total };
}

describe('ExamRail — drag & drop 정답지 PDF 업로드', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null, submissions: {} });
    filesToImagesMock.mockReset();
    filesToImagesMock.mockResolvedValue(['data:image/jpeg;base64,X']);
    extractAnswerStructureMock.mockReset();
  });

  it('PDF 1개 드롭 시 정답지 분석 후 새 시험 탭이 생성된다', async () => {
    extractAnswerStructureMock.mockResolvedValueOnce(structure('수학 모의고사', 10));
    render(<ExamRail />);

    const rail = document.querySelector('.g-rail') as HTMLElement;
    expect(rail).toBeTruthy();

    const file = makeFile('math.pdf', 'application/pdf');
    await act(async () => {
      fireEvent.drop(rail, { dataTransfer: makeDataTransfer([file]) });
    });

    await waitFor(() => {
      expect(useTabStore.getState().tabs).toHaveLength(1);
    });
    const [tab] = useTabStore.getState().tabs;
    expect(tab.title).toBe('수학 모의고사');
    expect(tab.answerKeyStructure?.totalQuestions).toBe(10);
    expect(tab.answerKeyFile?.fileRefs?.[0]).toBe(file);
    expect(extractAnswerStructureMock).toHaveBeenCalledTimes(1);
  });

  it('PDF 3개 드롭 시 시험 탭 3개가 생성된다', async () => {
    extractAnswerStructureMock
      .mockResolvedValueOnce(structure('A'))
      .mockResolvedValueOnce(structure('B'))
      .mockResolvedValueOnce(structure('C'));
    render(<ExamRail />);
    const rail = document.querySelector('.g-rail') as HTMLElement;
    const files = ['a.pdf', 'b.pdf', 'c.pdf'].map((n) =>
      makeFile(n, 'application/pdf'),
    );

    await act(async () => {
      fireEvent.drop(rail, { dataTransfer: makeDataTransfer(files) });
    });

    await waitFor(() => {
      expect(useTabStore.getState().tabs).toHaveLength(3);
    });
    const titles = useTabStore.getState().tabs.map((t) => t.title);
    expect(titles).toEqual(['A', 'B', 'C']);
  });

  it('PDF 2개 + .txt 1개 드롭 시 PDF만 처리되고 안내가 노출된다', async () => {
    extractAnswerStructureMock
      .mockResolvedValueOnce(structure('A'))
      .mockResolvedValueOnce(structure('B'));
    render(<ExamRail />);
    const rail = document.querySelector('.g-rail') as HTMLElement;
    const files = [
      makeFile('a.pdf', 'application/pdf'),
      makeFile('b.pdf', 'application/pdf'),
      makeFile('c.txt', 'text/plain'),
    ];

    await act(async () => {
      fireEvent.drop(rail, { dataTransfer: makeDataTransfer(files) });
    });

    await waitFor(() => {
      expect(useTabStore.getState().tabs).toHaveLength(2);
    });
    expect(extractAnswerStructureMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent(/제외/);
  });

  it('허용 타입이 0개인 드롭은 추가하지 않고 안내만 노출한다', async () => {
    render(<ExamRail />);
    const rail = document.querySelector('.g-rail') as HTMLElement;

    await act(async () => {
      fireEvent.drop(rail, {
        dataTransfer: makeDataTransfer([makeFile('a.txt', 'text/plain')]),
      });
    });

    expect(useTabStore.getState().tabs).toHaveLength(0);
    expect(extractAnswerStructureMock).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      /PDF.*이미지|이미지.*PDF/,
    );
  });

  it('정답지 분석 실패 시 탭이 생성되지 않고 에러 안내가 노출된다', async () => {
    extractAnswerStructureMock.mockRejectedValueOnce(new Error('분석 실패'));
    render(<ExamRail />);
    const rail = document.querySelector('.g-rail') as HTMLElement;

    await act(async () => {
      fireEvent.drop(rail, {
        dataTransfer: makeDataTransfer([makeFile('a.pdf', 'application/pdf')]),
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/실패|오류/);
    });
    expect(useTabStore.getState().tabs).toHaveLength(0);
  });
});
