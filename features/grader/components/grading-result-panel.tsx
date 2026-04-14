"use client";

import { useState } from "react";
import { StudentSubmission, QuestionResult } from "@/types/grading";
import { Check, X, ClipboardList, Pencil, Flag, EyeOff, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { DiffHighlight } from "./diff-highlight";

interface GradingResultPanelProps {
  submission: StudentSubmission | null;
  className?: string;
  onAnswerEdit?: (questionNumber: number, newAnswer: string) => void;
  onCorrectToggle?: (questionNumber: number, isCorrect: boolean) => void;
  onStudentNameEdit?: (newName: string) => void;
  onReportIssue?: () => void;
}

export function GradingResultPanel({ submission, className, onAnswerEdit, onCorrectToggle, onStudentNameEdit, onReportIssue }: GradingResultPanelProps) {
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [nameEditValue, setNameEditValue] = useState('');
  const [showWrongOnly, setShowWrongOnly] = useState(false);

  // 빈 상태: submission이 null
  if (!submission) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full bg-white p-8", className)}>
        <ClipboardList className="w-16 h-16 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-400 mb-2">채점 결과 없음</h3>
        <p className="text-sm text-gray-400 text-center">
          학생 답안을 선택하고 채점을 완료하면<br />결과가 여기에 표시됩니다.
        </p>
      </div>
    );
  }

  // submission이 있지만 채점이 완료되지 않은 상태
  if (!submission.score || !submission.results || submission.results.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full bg-white p-8", className)}>
        <ClipboardList className="w-16 h-16 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-400 mb-2">채점 대기 중</h3>
        <p className="text-sm text-gray-400 text-center">
          {submission.studentName}의 답안이<br />아직 채점되지 않았습니다.
        </p>
      </div>
    );
  }

  const { score, results, studentName } = submission;

  const startEditing = (questionNumber: number, currentAnswer: string) => {
    setEditingQuestion(questionNumber);
    setEditValue(currentAnswer);
  };

  const confirmEdit = () => {
    if (editingQuestion !== null && onAnswerEdit) {
      const originalAnswer = results.find(r => r.questionNumber === editingQuestion)?.studentAnswer || '';
      if (editValue !== originalAnswer) {
        onAnswerEdit(editingQuestion, editValue);
      }
    }
    setEditingQuestion(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingQuestion(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      confirmEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  const handleCorrectToggle = (questionNumber: number, currentIsCorrect: boolean) => {
    if (onCorrectToggle) {
      onCorrectToggle(questionNumber, !currentIsCorrect);
    }
  };

  const startEditingName = () => {
    setEditingName(true);
    setNameEditValue(studentName);
  };

  const confirmNameEdit = () => {
    if (onStudentNameEdit && nameEditValue.trim() !== "" && nameEditValue !== studentName) {
      onStudentNameEdit(nameEditValue.trim());
    }
    setEditingName(false);
  };

  const cancelNameEdit = () => {
    setEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      confirmNameEdit();
    } else if (e.key === 'Escape') {
      cancelNameEdit();
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-white", className)}>
      {/* 헤더: 채점 결과 요약 */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-gray-500 mb-1">학생</p>
            {editingName ? (
              <input
                type="text"
                value={nameEditValue}
                onChange={(e) => setNameEditValue(e.target.value)}
                onKeyDown={handleNameKeyDown}
                onBlur={confirmNameEdit}
                autoFocus
                className="text-lg font-semibold text-gray-800 border-b border-primary focus:outline-none w-32 bg-transparent"
              />
            ) : (
              <p
                onClick={startEditingName}
                className="text-lg font-semibold text-gray-800 cursor-pointer hover:bg-yellow-50 px-1 rounded transition-colors inline-block group"
                title="클릭하여 이름 수정"
              >
                {studentName}
                <Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 inline ml-2 mb-1 transition-opacity" />
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500 mb-1">점수</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-primary">
                {score.correct}
              </span>
              <span className="text-lg text-gray-400">/ {score.total}</span>
              <span className={cn(
                "ml-2 px-2 py-1 rounded text-sm font-bold",
                score.percentage >= 70 ? "bg-green-100 text-green-700" :
                score.percentage >= 50 ? "bg-yellow-100 text-yellow-700" :
                "bg-red-100 text-red-700"
              )}>
                {Math.round(score.percentage)}%
              </span>
            </div>
          </div>
        </div>

        {/* 진행 바 */}
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${score.percentage}%` }}
          />
        </div>

        {/* 제보 버튼 + 틀린 것만 보기 토글 */}
        <div className="flex items-center justify-between mt-2">
          {onReportIssue ? (
            <button
              onClick={onReportIssue}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-amber-600 transition-colors"
              title="채점 오류 제보"
            >
              <Flag className="w-3 h-3" />
              오류 제보
            </button>
          ) : <div />}
          <button
            onClick={() => setShowWrongOnly(prev => !prev)}
            className={cn(
              "flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors",
              showWrongOnly
                ? "text-red-600 bg-red-50 border-red-200"
                : "text-gray-400 border-transparent hover:text-gray-600"
            )}
          >
            {showWrongOnly ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            틀린 것만 보기
          </button>
        </div>
      </div>

      {/* 문제별 결과 테이블 */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider w-20">
                번호
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                문제
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                학생 답안
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                정답
              </th>
              <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider w-24">
                결과
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {showWrongOnly && results.every(r => r.isCorrect) && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <Check className="w-10 h-10 text-green-400 mx-auto mb-2" />
                  <p className="text-green-600 font-medium">모든 문제를 맞혔습니다!</p>
                </td>
              </tr>
            )}
            {(showWrongOnly ? results.filter(r => !r.isCorrect) : results).map((result: QuestionResult) => (
              <tr
                key={result.questionNumber}
                className={cn(
                  "transition-colors",
                  result.isCorrect
                    ? "bg-green-50 hover:bg-green-100"
                    : "bg-red-50 hover:bg-red-100"
                )}
              >
                <td className={cn(
                  "px-4 py-3 text-sm font-semibold",
                  result.isCorrect ? "text-green-700" : "text-red-700"
                )}>
                  {result.questionNumber}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {result.question || "-"}
                </td>
                <td className={cn(
                  "px-4 py-3 text-sm",
                  result.isCorrect
                    ? "text-green-700"
                    : "text-red-400"
                )}>
                  {editingQuestion === result.questionNumber ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={confirmEdit}
                      autoFocus
                      className="w-full px-2 py-1 border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white text-gray-900"
                    />
                  ) : (
                    <div
                      onClick={() => startEditing(result.questionNumber, result.studentAnswer)}
                      className={cn(
                        "cursor-pointer hover:bg-yellow-100 px-2 py-1 rounded transition-colors inline-flex items-center gap-1",
                        result.isEdited && "border-b-2 border-dashed border-amber-500"
                      )}
                    >
                      {result.isEdited && <Pencil className="w-3 h-3 text-amber-600" />}
                      <span className={cn(!result.isCorrect && "line-through")}>
                        {result.studentAnswer || "-"}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  {result.isCorrect ? (
                    <span className="text-green-700">{result.correctAnswer || "-"}</span>
                  ) : (
                    <DiffHighlight
                      studentAnswer={result.studentAnswer || ""}
                      correctAnswer={result.correctAnswer || "-"}
                    />
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    {result.isCorrect ? (
                      <button
                        onClick={() => handleCorrectToggle(result.questionNumber, result.isCorrect)}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500 hover:bg-green-600 hover:scale-110 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-400"
                        title="클릭하여 오답으로 변경"
                      >
                        <Check className="w-5 h-5 text-white stroke-[3]" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleCorrectToggle(result.questionNumber, result.isCorrect)}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 hover:scale-110 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400"
                        title="클릭하여 정답으로 변경"
                      >
                        <X className="w-5 h-5 text-white stroke-[3]" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
