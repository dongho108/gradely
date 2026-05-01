import { describe, it, expect } from 'vitest';
import {
  ACCEPTED_SUBMISSION_TYPES,
  isAcceptedSubmissionFile,
  partitionFilesByAccepted,
} from '../submission-drop-utils';

function makeFile(name: string, type: string): File {
  return new File([''], name, { type });
}

describe('submission-drop-utils', () => {
  describe('ACCEPTED_SUBMISSION_TYPES', () => {
    it('PDF, JPEG, PNG 만 포함한다', () => {
      expect(ACCEPTED_SUBMISSION_TYPES).toEqual([
        'application/pdf',
        'image/jpeg',
        'image/png',
      ]);
    });
  });

  describe('isAcceptedSubmissionFile', () => {
    it.each([
      ['a.pdf', 'application/pdf', true],
      ['a.jpg', 'image/jpeg', true],
      ['a.png', 'image/png', true],
      ['a.txt', 'text/plain', false],
      ['a.gif', 'image/gif', false],
      ['a.webp', 'image/webp', false],
      ['a', '', false],
    ])('%s (%s) -> %s', (name, type, expected) => {
      expect(isAcceptedSubmissionFile(makeFile(name, type))).toBe(expected);
    });
  });

  describe('partitionFilesByAccepted', () => {
    it('허용/비허용 파일을 분리한다', () => {
      const files = [
        makeFile('a.pdf', 'application/pdf'),
        makeFile('b.jpg', 'image/jpeg'),
        makeFile('c.txt', 'text/plain'),
        makeFile('d.png', 'image/png'),
        makeFile('e.gif', 'image/gif'),
      ];
      const { accepted, rejected } = partitionFilesByAccepted(files);
      expect(accepted.map((f) => f.name)).toEqual(['a.pdf', 'b.jpg', 'd.png']);
      expect(rejected.map((f) => f.name)).toEqual(['c.txt', 'e.gif']);
    });

    it('빈 입력에 대해 빈 결과를 반환한다', () => {
      const { accepted, rejected } = partitionFilesByAccepted([]);
      expect(accepted).toEqual([]);
      expect(rejected).toEqual([]);
    });

    it('FileList 형태도 지원한다', () => {
      const files = [
        makeFile('a.pdf', 'application/pdf'),
        makeFile('b.txt', 'text/plain'),
      ];
      // emulate FileList minimal shape
      const fileListLike: FileList = {
        length: files.length,
        item: (i: number) => files[i] ?? null,
        [Symbol.iterator]: function* () {
          for (const f of files) yield f;
        },
      } as unknown as FileList;
      Object.assign(fileListLike, files);
      const { accepted, rejected } = partitionFilesByAccepted(fileListLike);
      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    });
  });
});
