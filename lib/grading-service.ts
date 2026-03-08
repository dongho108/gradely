import { GradingResult, QuestionResult, AnswerKeyStructure, StudentExamStructure } from '@/types/grading';
import { supabase } from './supabase';
import { fileToImages } from './file-utils';
import { MOCK_ANSWER_STRUCTURE, MOCK_STUDENT_EXAM_STRUCTURE } from './mock-data';

/**
 * Extracts the correct answers AND their coordinates from the Answer Key PDF
 */
export async function extractAnswerStructure(file: File): Promise<AnswerKeyStructure> {
  try {
    const images = await fileToImages(file);
    
    const { data, error } = await supabase.functions.invoke('extract-answer-structure', {
      body: { images }
    });

    if (error) throw error;
    if (!data.success) throw new Error(data.error || 'Failed to extract answer structure');

    return data.data as AnswerKeyStructure;
  } catch (error) {
    console.error('Extract Answer Structure Error:', error);
    return MOCK_ANSWER_STRUCTURE;
  }
}

/**
 * Extracts ONLY the student's text answers and name from the Exam PDF
 */
export async function extractExamStructure(file: File): Promise<StudentExamStructure> {
  try {
    const images = await fileToImages(file);
    
    const { data, error } = await supabase.functions.invoke('extract-exam-structure', {
      body: { images }
    });

    if (error) throw error;
    if (!data.success) throw new Error(data.error || 'Failed to extract exam structure');

    return data.data as StudentExamStructure;
  } catch (error) {
    console.error('Extract Exam Structure Error:', error);
    return MOCK_STUDENT_EXAM_STRUCTURE;
  }
}

/**
 * Normalizes text for comparison by removing whitespace, special characters, and converting to lowercase.
 */
function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '') // Remove all whitespace
    .replace(/[()[\]{}]/g, ''); // Remove parentheses and brackets
}

/**
 * Checks if a student's answer matches any of the possible correct answers.
 */
export function isAnswerCorrect(studentAnswer: string, correctAnswer: string): boolean {
  const normStudent = normalizeText(studentAnswer);
  
  // 새 구분자(|||) 우선, 없으면 기존 구분자 사용 (하위호환)
  const possibleAnswers = correctAnswer.includes('|||')
    ? correctAnswer.split('|||').map(a => normalizeText(a))
    : correctAnswer.split(/[\\/|,]/).map(a => normalizeText(a));

  return possibleAnswers.some(ans => ans === normStudent && ans !== "");
}

/**
 * Local grading logic: compares student answers using coordinates from the answer key.
 * Uses AI semantic fallback only for Korean answers.
 */
export async function calculateGradingResult(
  submissionId: string,
  answerKey: AnswerKeyStructure,
  studentExam: StudentExamStructure
): Promise<GradingResult> {
  const results: QuestionResult[] = [];
  const failedQuestions: { id: string; studentAnswer: string; correctAnswer: string }[] = [];
  let correctCount = 0;

  // 1. Initial Local Match Pass
  Object.entries(answerKey.answers).forEach(([qNum, answerKeyData]) => {
    const studentAnswerRaw = studentExam.answers[qNum] || "(미작성)";
    const isLocalMatch = studentAnswerRaw !== "(미작성)" && studentAnswerRaw !== "(판독불가)" && isAnswerCorrect(studentAnswerRaw, answerKeyData.text);

    if (isLocalMatch) {
      correctCount++;
      results.push({
        questionNumber: parseInt(qNum),
        studentAnswer: studentAnswerRaw,
        correctAnswer: answerKeyData.text,
        question: answerKeyData.question, // Pass original question text
        isCorrect: true,
      });
    } else {
      // Collect for AI batch if candidate for semantic check
      const isCandidate = studentAnswerRaw !== "(미작성)" && studentAnswerRaw !== "(판독불가)";
      
      // 언어 판별: 정답 또는 학생 답안에 한글이 포함되어 있는지 확인
      const koreanRegex = /[ㄱ-ㅎㅏ-ㅣ가-힣]/;
      const hasKorean = koreanRegex.test(answerKeyData.text) || koreanRegex.test(studentAnswerRaw);

      // 한글이 포함된 경우 AI 의미 채점(Semantic Check) 후보로 등록
      if (isCandidate && hasKorean) {
        failedQuestions.push({ id: qNum, studentAnswer: studentAnswerRaw, correctAnswer: answerKeyData.text });
      }
      
      results.push({
        questionNumber: parseInt(qNum),
        studentAnswer: studentAnswerRaw,
        correctAnswer: answerKeyData.text,
        question: answerKeyData.question, // Pass original question text
        isCorrect: false, // 기본값은 false, AI가 승인하면 나중에 업데이트됨
      });
    }
  });

  // 2. AI Semantic Batch Check (Fallback for Korean answers)
  if (failedQuestions.length > 0) {
    try {
      const { data, error } = await supabase.functions.invoke('verify-semantic-grading', {
        body: { questions: failedQuestions }
      });

      if (!error && data.success) {
        const aiResults: { id: string; isCorrect: boolean; reason: string }[] = data.data;
        aiResults.forEach(aiResult => {
          if (aiResult.isCorrect) {
            const questionIdx = results.findIndex(r => r.questionNumber === parseInt(aiResult.id));
            if (questionIdx !== -1) {
              results[questionIdx].isCorrect = true;
              correctCount++;
              console.log(`AI Semantic Match [Q${aiResult.id}]: "${results[questionIdx].studentAnswer}" -> Correct (${aiResult.reason})`);
            }
          }
        });
      }
    } catch (error) {
      console.warn('Batch semantic grading failed:', error);
    }
  }

  // DERIVE TOTAL COUNT
  const total = Object.keys(answerKey.answers).length;
  const percentage = total > 0 ? (correctCount / total) * 100 : 0;

  return {
    submissionId,
    studentName: studentExam.studentName,
    score: {
      correct: correctCount,
      total,
      percentage,
    },
    results,
  };
}

/**
 * Legacy support
 */
export async function gradeSubmission(
  answerKeyFile: File,
  studentFile: File
): Promise<GradingResult> {
  const answerStructure = await extractAnswerStructure(answerKeyFile);
  const examStructure = await extractExamStructure(studentFile);
  return await calculateGradingResult('temp-id', answerStructure, examStructure);
}

/**
 * Recalculates grading result after manual answer edit.
 * Pure synchronous function - no AI calls, only local text matching.
 */
export function recalculateAfterEdit(
  submissionId: string,
  results: QuestionResult[],
  editedQuestionNumber: number,
  newStudentAnswer: string,
  studentName?: string
): GradingResult {
  const updatedResults = results.map((result) => {
    if (result.questionNumber !== editedQuestionNumber) return result;
    return {
      ...result,
      studentAnswer: newStudentAnswer,
      isCorrect: isAnswerCorrect(newStudentAnswer, result.correctAnswer),
      isEdited: true,
    };
  });

  const correct = updatedResults.filter((r) => r.isCorrect).length;
  const total = updatedResults.length;

  return {
    submissionId,
    studentName,
    score: { correct, total, percentage: total > 0 ? (correct / total) * 100 : 0 },
    results: updatedResults,
  };
}

/**
 * Toggles the correct/incorrect status of a specific question.
 * Allows teachers to manually override grading results.
 */
export function toggleCorrectStatus(
  submissionId: string,
  results: QuestionResult[],
  questionNumber: number,
  newIsCorrect: boolean,
  studentName?: string
): GradingResult {
  const updatedResults = results.map((result) => {
    if (result.questionNumber !== questionNumber) return result;
    return {
      ...result,
      isCorrect: newIsCorrect,
      isEdited: true,
    };
  });

  const correct = updatedResults.filter((r) => r.isCorrect).length;
  const total = updatedResults.length;

  return {
    submissionId,
    studentName,
    score: { correct, total, percentage: total > 0 ? (correct / total) * 100 : 0 },
    results: updatedResults,
  };
}

