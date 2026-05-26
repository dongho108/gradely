/**
 * 2026년 5월 grading_reports 14건 박제 fixture.
 *
 * 제외된 3건 (submission_storage_path 누락):
 * - 이아연 (7h9bnke) - 11/21번 빈칸 환각
 * - 전하령 (cmmpiso) - 답안 정확도 떨어짐
 * - 김민서 (cybwqm6) - 13번 대출
 *
 * 각 fixture는 production OCR/채점을 재실행해 제보 버그가 재현되는지,
 * 그리고 OpenCV 전처리 후 해결되는지 검증할 때 사용한다.
 */

export type ReportBugType =
  | 'phantom' // 학생 빈칸 → LLM이 답 환각 (잘못된 정답 처리)
  | 'missing' // 학생 작성 → LLM이 (미작성)으로 인식 (잘못된 오답 처리)
  | 'misread'; // 학생 작성 → LLM이 다른 텍스트로 인식

export interface ReportFixture {
  reportId: string;
  submissionId: string;
  sessionId: string;
  studentName: string;
  comment: string;
  storagePath: string; // exam-files 버킷 경로 (필수, 없는 것은 fixture에서 제외)
  expectedBugType: ReportBugType;
  /** 제보가 가리키는 문제 번호들 (대부분 1개, 이아연 케이스는 [11, 21]) */
  affectedQuestions: number[];
  /**
   * 각 affectedQuestion에서 "올바른" OCR 결과가 어떻게 나와야 하는지.
   * - 'blank' : (미작성) 또는 (판독불가)로 인식돼야 함 (phantom 케이스)
   * - 'filled': 실제 학생이 쓴 답안 텍스트가 추출돼야 함 (missing/misread 케이스)
   * 실제 텍스트가 있으면 expectedStudentText에 명시.
   */
  expectedOcrShape: 'blank' | 'filled';
  /** 학생이 실제 손글씨로 쓴 텍스트 (사용자 제보 기반, missing/misread 케이스에서 유효) */
  expectedStudentText?: string;
}

export const REPORT_FIXTURES: ReportFixture[] = [
  // === 세션 ff54uzt (원당고2 S2-1 시험 ㄷ지, lenient) ===
  {
    reportId: '714a5200-44bf-47ed-8a9b-492db59ecc8e',
    submissionId: 'x9j4pgk',
    sessionId: 'ff54uzt',
    studentName: '김동하',
    comment: '42번 적용한 이라고 오답 작성했지만 정답으로 인식',
    storagePath: '2c3412c7-488a-4d4f-9754-3b079b3b5145/ff54uzt/submissions/x9j4pgk.jpeg',
    expectedBugType: 'misread',
    affectedQuestions: [42],
    expectedOcrShape: 'filled',
    expectedStudentText: '적용한 이',
  },
  {
    reportId: '62838889-db12-44eb-a9d1-27208830661a',
    submissionId: 'x9j4pgk',
    sessionId: 'ff54uzt',
    studentName: '김동하',
    comment: '41번 존엄이라고 오답 작성했지만 정답 인식',
    storagePath: '2c3412c7-488a-4d4f-9754-3b079b3b5145/ff54uzt/submissions/x9j4pgk.jpeg',
    expectedBugType: 'misread',
    affectedQuestions: [41],
    expectedOcrShape: 'filled',
    expectedStudentText: '존엄',
  },
  {
    reportId: 'f508ad63-ca9c-4e43-9227-db710a8663e4',
    submissionId: 'yuywc79',
    sessionId: 'ff54uzt',
    studentName: '나편',
    comment: '31번 성실하다 라고 작성했는데 정답으로 인식함',
    storagePath: '2c3412c7-488a-4d4f-9754-3b079b3b5145/ff54uzt/submissions/yuywc79.jpeg',
    expectedBugType: 'misread',
    affectedQuestions: [31],
    expectedOcrShape: 'filled',
    expectedStudentText: '성실하다',
  },
  {
    reportId: '53890e64-4b29-4d19-b12b-5c6dee16f73b',
    submissionId: 'akbmxsz',
    sessionId: 'ff54uzt',
    studentName: '임시명',
    comment: '42번 멈추다라고 작성했는데 정답으로 인식함',
    storagePath: '2c3412c7-488a-4d4f-9754-3b079b3b5145/ff54uzt/submissions/akbmxsz.jpeg',
    expectedBugType: 'misread',
    affectedQuestions: [42],
    expectedOcrShape: 'filled',
    expectedStudentText: '멈추다',
  },

  // === 세션 la29jix (아라고2 S2 시험 ㄷ지, lenient) ===
  {
    reportId: '5f4e1bb1-2d02-4882-ab74-ac5f293d933a',
    submissionId: 'pk4ns48',
    sessionId: 'la29jix',
    studentName: '김이인',
    comment: '35번 미작성인데 정답처리 됨',
    storagePath: '2c3412c7-488a-4d4f-9754-3b079b3b5145/la29jix/submissions/pk4ns48.jpeg',
    expectedBugType: 'phantom',
    affectedQuestions: [35],
    expectedOcrShape: 'blank',
  },
  {
    reportId: '2753262f-a2bb-4420-9e03-fede11a8bc73',
    submissionId: '9wdzhav',
    sessionId: 'la29jix',
    studentName: '최준영',
    comment: '24번 미작성인데 작성이라고 뜸',
    storagePath: '2c3412c7-488a-4d4f-9754-3b079b3b5145/la29jix/submissions/9wdzhav.jpeg',
    expectedBugType: 'phantom',
    affectedQuestions: [24],
    expectedOcrShape: 'blank',
  },

  // === 세션 nh0h0rg (원당고1 S2 시험 ㄷ지, lenient) ===
  {
    reportId: '3f6b07a5-296f-40d5-ae45-09b2b504b5af',
    submissionId: '1ju8yns',
    sessionId: 'nh0h0rg',
    studentName: '노인수',
    comment: '18번 빈칸인데 정답처리',
    storagePath: '2c3412c7-488a-4d4f-9754-3b079b3b5145/nh0h0rg/submissions/1ju8yns.jpeg',
    expectedBugType: 'phantom',
    affectedQuestions: [18],
    expectedOcrShape: 'blank',
  },

  // === 세션 9rz482g (원당고2 S2-1 시험 답지, lenient) ===
  {
    reportId: '483d8c4f-52b0-4a5d-8d5c-79ce4cffdc5f',
    submissionId: '900bvl1',
    sessionId: '9rz482g',
    studentName: '고은아',
    comment: '8번 환호라고 작성했지만 미작성으로 인식',
    storagePath: '2c3412c7-488a-4d4f-9754-3b079b3b5145/9rz482g/submissions/900bvl1.jpeg',
    expectedBugType: 'missing',
    affectedQuestions: [8],
    expectedOcrShape: 'filled',
    expectedStudentText: '환호',
  },

  // === 세션 p344qwb (원당고2 S2 시험 답지, lenient) ===
  {
    reportId: '7b665df0-3967-4e21-b102-7584ee7dbe2f',
    submissionId: '7nr3s8y',
    sessionId: 'p344qwb',
    studentName: '이재현',
    comment: '39번 반사라고 작성했지만 미작성으로 인식',
    storagePath: '2c3412c7-488a-4d4f-9754-3b079b3b5145/p344qwb/submissions/7nr3s8y.jpeg',
    expectedBugType: 'missing',
    affectedQuestions: [39],
    expectedOcrShape: 'filled',
    expectedStudentText: '반사',
  },
  {
    reportId: '0da849ef-31ca-4688-941d-d2c761faae23',
    submissionId: '7nr3s8y',
    sessionId: 'p344qwb',
    studentName: '이재현',
    comment: '15번 멈추다라고 정답 작성 했지만 미작성으로 인식',
    storagePath: '2c3412c7-488a-4d4f-9754-3b079b3b5145/p344qwb/submissions/7nr3s8y.jpeg',
    expectedBugType: 'missing',
    affectedQuestions: [15],
    expectedOcrShape: 'filled',
    expectedStudentText: '멈추다',
  },
  {
    reportId: '98b48cab-bab1-450e-9aed-c5ca07cc5f11',
    submissionId: 'lp53z5g',
    sessionId: 'p344qwb',
    studentName: '장유리',
    comment: '39번 반사체라고 작성 했지만 미작성으로 인식',
    storagePath: '2c3412c7-488a-4d4f-9754-3b079b3b5145/p344qwb/submissions/lp53z5g.jpeg',
    expectedBugType: 'missing',
    affectedQuestions: [39],
    expectedOcrShape: 'filled',
    expectedStudentText: '반사체',
  },
  {
    reportId: '4af1293e-ed7f-4305-b811-a57f4bfe402a',
    submissionId: 'lp53z5g',
    sessionId: 'p344qwb',
    studentName: '장유리',
    comment: '30번에 유산이라고 정답 작성했지만 미작성으로 인식 후 틀렸다고 뜸',
    storagePath: '2c3412c7-488a-4d4f-9754-3b079b3b5145/p344qwb/submissions/lp53z5g.jpeg',
    expectedBugType: 'missing',
    affectedQuestions: [30],
    expectedOcrShape: 'filled',
    expectedStudentText: '유산',
  },

  // === 세션 osqg78m (아라고2 S2 시험 답지, lenient) ===
  {
    reportId: '3387f880-18db-4fc0-a6c3-1611cdfd2014',
    submissionId: 'z3o2e23',
    sessionId: 'osqg78m',
    studentName: '최준원',
    comment: '18번 미작성인데 정답 처리 됨',
    storagePath: '2c3412c7-488a-4d4f-9754-3b079b3b5145/osqg78m/submissions/z3o2e23.jpeg',
    expectedBugType: 'phantom',
    affectedQuestions: [18],
    expectedOcrShape: 'blank',
  },

  // === 세션 8qwac6p (원당고3 T 단어 재시험, lenient) ===
  {
    reportId: 'c7e2cd8b-7bcc-4212-ac34-a7061449867c',
    submissionId: 'mo15y5c',
    sessionId: '8qwac6p',
    studentName: '이수인',
    comment: '22번 포착하다로 쓴 답안이 포획하다로 인식됨',
    storagePath: '2c3412c7-488a-4d4f-9754-3b079b3b5145/8qwac6p/submissions/mo15y5c.jpeg',
    expectedBugType: 'misread',
    affectedQuestions: [22],
    expectedOcrShape: 'filled',
    expectedStudentText: '포착하다',
  },
];

/** session_id → 해당 세션에 속한 fixture 들로 그룹핑 (answer_key는 세션당 1회만 로드하면 됨) */
export function groupBySession(fixtures: ReportFixture[]): Map<string, ReportFixture[]> {
  const map = new Map<string, ReportFixture[]>();
  for (const f of fixtures) {
    if (!map.has(f.sessionId)) map.set(f.sessionId, []);
    map.get(f.sessionId)!.push(f);
  }
  return map;
}

/** submission_id → 해당 학생에 속한 fixture 들로 그룹핑 (OCR도 학생당 1회만) */
export function groupBySubmission(fixtures: ReportFixture[]): Map<string, ReportFixture[]> {
  const map = new Map<string, ReportFixture[]>();
  for (const f of fixtures) {
    if (!map.has(f.submissionId)) map.set(f.submissionId, []);
    map.get(f.submissionId)!.push(f);
  }
  return map;
}
