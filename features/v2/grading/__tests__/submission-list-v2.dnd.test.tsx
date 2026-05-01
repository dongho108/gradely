import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useTabStore } from '@/store/use-tab-store';
import type { StoreExamSession } from '@/store/use-tab-store';
import type { AnswerKeyStructure } from '@/types/grading';
import { SubmissionListV2 } from '../submission-list-v2';

vi.mock('../scan-footer-v2', () => ({
  ScanFooterV2: () => <div data-testid="scan-footer-stub" />,
}));

// Avoid actually uploading to Supabase Storage during tests.
vi.mock('@/lib/auto-save', () => ({
  uploadAndTrackSubmission: vi.fn(async () => {}),
}));

vi.mock('@/store/use-auth-store', () => ({
  useAuthStore: Object.assign(
    () => null,
    {
      getState: () => ({ user: null }),
    },
  ),
}));

function makeFile(name: string, type: string): File {
  return new File(['dummy'], name, { type });
}

const STRUCTURE: AnswerKeyStructure = {
  title: '수학',
  answers: { '1': { text: 'A' } },
  totalQuestions: 1,
};

function seedTab(tabId: string, hasAnswerKey: boolean) {
  const tab: StoreExamSession = {
    id: tabId,
    title: '수학',
    createdAt: Date.now(),
    status: hasAnswerKey ? 'ready' : 'idle',
    answerKeyStructure: hasAnswerKey ? STRUCTURE : undefined,
  };
  useTabStore.setState({
    tabs: [tab],
    activeTabId: tabId,
    submissions: { [tabId]: [] },
  });
}

function makeDataTransfer(files: File[]): DataTransfer {
  // jsdom DataTransfer has limited support; build a minimal stub.
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

function renderList(tabId: string) {
  return render(
    <SubmissionListV2
      tabId={tabId}
      view={{ kind: 'answer-key' }}
      onSelectAnswerKey={() => {}}
      onSelectStudent={() => {}}
    />,
  );
}

describe('SubmissionListV2 — drag & drop PDF/이미지 업로드', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null, submissions: {} });
  });

  it('PDF 1개 드롭 시 submission 1개가 queued 상태로 추가된다', async () => {
    const tabId = 'tab-a';
    seedTab(tabId, true);
    renderList(tabId);

    const dropZone = document.querySelector('.g-students') as HTMLElement;
    expect(dropZone).toBeTruthy();

    const file = makeFile('alice.pdf', 'application/pdf');
    await act(async () => {
      fireEvent.drop(dropZone, { dataTransfer: makeDataTransfer([file]) });
    });

    const subs = useTabStore.getState().submissions[tabId];
    expect(subs).toHaveLength(1);
    expect(subs[0].fileName).toBe('alice.pdf');
    expect(subs[0].status).toBe('queued');
    expect(subs[0].fileRefs?.[0]).toBe(file);
  });

  it('PDF 3개 + JPG 1개 + .txt 1개 드롭 시 4개만 추가된다', async () => {
    const tabId = 'tab-b';
    seedTab(tabId, true);
    renderList(tabId);
    const dropZone = document.querySelector('.g-students') as HTMLElement;

    const files = [
      makeFile('a.pdf', 'application/pdf'),
      makeFile('b.pdf', 'application/pdf'),
      makeFile('c.pdf', 'application/pdf'),
      makeFile('d.jpg', 'image/jpeg'),
      makeFile('e.txt', 'text/plain'),
    ];

    await act(async () => {
      fireEvent.drop(dropZone, { dataTransfer: makeDataTransfer(files) });
    });

    const subs = useTabStore.getState().submissions[tabId];
    expect(subs.map((s) => s.fileName)).toEqual([
      'a.pdf',
      'b.pdf',
      'c.pdf',
      'd.jpg',
    ]);
    subs.forEach((s) => expect(s.status).toBe('queued'));
  });

  it('정답지 미등록 탭에서는 드롭이 거부되고 안내 메시지가 노출된다', async () => {
    const tabId = 'tab-c';
    seedTab(tabId, false);
    renderList(tabId);
    const dropZone = document.querySelector('.g-students') as HTMLElement;

    await act(async () => {
      fireEvent.drop(dropZone, {
        dataTransfer: makeDataTransfer([makeFile('a.pdf', 'application/pdf')]),
      });
    });

    expect(useTabStore.getState().submissions[tabId]).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent(/정답지부터 등록/);
  });

  it('허용 타입이 0개인 드롭은 안내 메시지만 노출하고 추가하지 않는다', async () => {
    const tabId = 'tab-d';
    seedTab(tabId, true);
    renderList(tabId);
    const dropZone = document.querySelector('.g-students') as HTMLElement;

    await act(async () => {
      fireEvent.drop(dropZone, {
        dataTransfer: makeDataTransfer([
          makeFile('a.txt', 'text/plain'),
          makeFile('b.gif', 'image/gif'),
        ]),
      });
    });

    expect(useTabStore.getState().submissions[tabId]).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent(/PDF.*이미지|이미지.*PDF/);
  });
});
