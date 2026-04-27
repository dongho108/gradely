import { GradingResult, QuestionResult, AnswerKeyStructure, StudentExamStructure, GradingStrictness } from '@/types/grading';
import { supabase } from './supabase';
import { fileToImages } from './file-utils';
import { MOCK_ANSWER_STRUCTURE, MOCK_STUDENT_EXAM_STRUCTURE } from './mock-data';
import { getGradingPrompt } from './grading-prompts';

/**
 * Extracts answer structure from pre-converted base64 images.
 * Use when you already have images from multiple files (e.g. duplex scan).
 */
export async function extractAnswerStructureFromImages(images: string[]): Promise<AnswerKeyStructure> {
  try {
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
 * Extracts the correct answers AND their coordinates from the Answer Key PDF
 */
export async function extractAnswerStructure(file: File): Promise<AnswerKeyStructure> {
  const images = await fileToImages(file);
  return extractAnswerStructureFromImages(images);
}

/**
 * Extracts exam structure from pre-converted base64 images.
 * Use when you already have images from multiple files (e.g. duplex scan).
 */
export async function extractExamStructureFromImages(images: string[]): Promise<StudentExamStructure> {
  try {
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
 * Extracts ONLY the student's text answers and name from the Exam PDF
 */
export async function extractExamStructure(file: File): Promise<StudentExamStructure> {
  const images = await fileToImages(file);
  return extractExamStructureFromImages(images);
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
 * AI 시멘틱 채점: 모든 문항을 AI에게 보내 의미 기반으로 채점한다.
 * AI 실패 시 로컬 텍스트 매칭으로 graceful fallback.
 */
export async function calculateGradingResult(
  submissionId: string,
  answerKey: AnswerKeyStructure,
  studentExam: StudentExamStructure,
  strictness: GradingStrictness = 'standard'
): Promise<GradingResult> {
  const results: QuestionResult[] = [];
  const aiQuestions: { id: string; studentAnswer: string; correctAnswer: string; question?: string }[] = [];

  // 1. 문항 분류: 미작성/판독불가는 즉시 오답, 나머지는 AI 채점 대상
  Object.entries(answerKey.answers).forEach(([qNum, answerKeyData]) => {
    const studentAnswerRaw = studentExam.answers[qNum] || "(미작성)";
    const isUnanswered = studentAnswerRaw === "(미작성)" || studentAnswerRaw === "(판독불가)";

    if (isUnanswered) {
      results.push({
        questionNumber: parseInt(qNum),
        studentAnswer: studentAnswerRaw,
        correctAnswer: answerKeyData.text,
        question: answerKeyData.question,
        isCorrect: false,
      });
    } else {
      aiQuestions.push({
        id: qNum,
        studentAnswer: studentAnswerRaw,
        correctAnswer: answerKeyData.text,
        question: answerKeyData.question,
      });
      results.push({
        questionNumber: parseInt(qNum),
        studentAnswer: studentAnswerRaw,
        correctAnswer: answerKeyData.text,
        question: answerKeyData.question,
        isCorrect: false, // AI 결과로 업데이트됨
      });
    }
  });

  // 2. 채점 실행
  let correctCount = 0;

  if (aiQuestions.length > 0) {
    if (strictness === 'strict') {
      // strict 모드: AI 호출 없이 로컬 텍스트 비교
      results.forEach(result => {
        if (result.studentAnswer !== "(미작성)" && result.studentAnswer !== "(판독불가)") {
          result.isCorrect = isAnswerCorrect(result.studentAnswer, result.correctAnswer);
          if (result.isCorrect) correctCount++;
        }
      });
    } else {
      // standard/lenient 모드: 로컬 정확 일치 우선, 나머지만 AI 시멘틱 채점.
      // 텍스트적으로 명백한 일치는 LLM 비결정성 영향을 받지 않도록 결정론적으로 처리한다.
      const aiNeededQuestions: typeof aiQuestions = [];
      aiQuestions.forEach(q => {
        if (isAnswerCorrect(q.studentAnswer, q.correctAnswer)) {
          const questionIdx = results.findIndex(r => r.questionNumber === parseInt(q.id));
          if (questionIdx !== -1) {
            results[questionIdx].isCorrect = true;
            results[questionIdx].aiReason = '정답 일치';
            correctCount++;
          }
        } else {
          aiNeededQuestions.push(q);
        }
      });

      let aiSuccess = aiNeededQuestions.length === 0;

      if (aiNeededQuestions.length > 0) {
        try {
          const systemPrompt = getGradingPrompt(strictness);
          const { data, error } = await supabase.functions.invoke('verify-semantic-grading-v2', {
            body: { questions: aiNeededQuestions, systemPrompt }
          });

          if (!error && data?.success) {
            const aiResults: { id: string; isCorrect: boolean; reason: string }[] = data.data;
            aiResults.forEach(aiResult => {
              const questionIdx = results.findIndex(r => r.questionNumber === parseInt(aiResult.id));
              if (questionIdx !== -1) {
                results[questionIdx].isCorrect = aiResult.isCorrect;
                results[questionIdx].aiReason = aiResult.reason;
                if (aiResult.isCorrect) correctCount++;
              }
            });
            aiSuccess = true;
          }
        } catch (error) {
          console.warn('AI semantic grading failed, falling back to local matching:', error);
        }

        // AI 실패 시 로컬 매칭은 이미 false로 판정된 항목이라 그대로 false 유지
      }
    }
  }

  const total = Object.keys(answerKey.answers).length;
  const percentage = total > 0 ? (correctCount / total) * 100 : 0;

  return {
    submissionId,
    studentName: studentExam.studentName,
    score: { correct: correctCount, total, percentage },
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
 * AI 시멘틱 채점으로 재채점, 실패 시 로컬 매칭 fallback.
 */
export async function recalculateAfterEdit(
  submissionId: string,
  results: QuestionResult[],
  editedQuestionNumber: number,
  newStudentAnswer: string,
  studentName?: string,
  strictness: GradingStrictness = 'standard'
): Promise<GradingResult> {
  const editedResult = results.find(r => r.questionNumber === editedQuestionNumber);
  let newIsCorrect = false;
  let aiReason: string | undefined;

  if (editedResult && newStudentAnswer !== "(미작성)" && newStudentAnswer !== "(판독불가)") {
    if (strictness === 'strict') {
      // strict 모드: AI 호출 없이 로컬 텍스트 비교
      newIsCorrect = isAnswerCorrect(newStudentAnswer, editedResult.correctAnswer);
    } else {
      // standard/lenient 모드: 로컬 정확 일치 우선, 안 맞으면 AI 시멘틱 채점
      if (isAnswerCorrect(newStudentAnswer, editedResult.correctAnswer)) {
        newIsCorrect = true;
        aiReason = '정답 일치';
      } else {
        try {
          const systemPrompt = getGradingPrompt(strictness);
          const { data, error } = await supabase.functions.invoke('verify-semantic-grading-v2', {
            body: {
              questions: [{
                id: String(editedQuestionNumber),
                studentAnswer: newStudentAnswer,
                correctAnswer: editedResult.correctAnswer,
                question: editedResult.question,
              }],
              systemPrompt,
            }
          });

          if (!error && data?.success && data.data?.[0]) {
            newIsCorrect = data.data[0].isCorrect;
            aiReason = data.data[0].reason;
          } else {
            newIsCorrect = false;
          }
        } catch {
          newIsCorrect = false;
        }
      }
    }
  }

  const updatedResults = results.map((result) => {
    if (result.questionNumber !== editedQuestionNumber) return result;
    return {
      ...result,
      studentAnswer: newStudentAnswer,
      isCorrect: newIsCorrect,
      isEdited: true,
      aiReason,
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

