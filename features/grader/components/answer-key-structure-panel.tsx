"use client";

import { AnswerKeyStructure } from "@/types/grading";
import { ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnswerKeyStructurePanelProps {
  structure: AnswerKeyStructure | null | undefined;
  className?: string;
}

export function AnswerKeyStructurePanel({ structure, className }: AnswerKeyStructurePanelProps) {
  if (!structure) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full bg-white p-8", className)}>
        <ClipboardList className="w-16 h-16 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-400 mb-2">구조 추출 결과 없음</h3>
        <p className="text-sm text-gray-400 text-center">
          정답지의 구조가 아직 추출되지 않았습니다.
        </p>
      </div>
    );
  }

  const sortedEntries = Object.entries(structure.answers).sort(
    ([a], [b]) => Number(a) - Number(b)
  );

  return (
    <div className={cn("flex flex-col h-full bg-white", className)}>
      {/* 헤더: 정답지 요약 */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 mb-1">시험명</p>
            <p className="text-lg font-semibold text-gray-800">{structure.title}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500 mb-1">총 문항</p>
            <span className="text-2xl font-bold text-primary">
              {structure.totalQuestions}
            </span>
          </div>
        </div>
      </div>

      {/* 문항별 정답 테이블 */}
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
                정답
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sortedEntries.map(([num, answer]) => (
              <tr
                key={num}
                className="bg-white hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3 text-sm font-semibold text-gray-700">
                  {num}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {answer.question || "-"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-800">
                  {answer.text || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
