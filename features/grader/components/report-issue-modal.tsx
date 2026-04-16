"use client";

import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StudentSubmission } from '@/types/grading';
import { AnswerKeyStructure } from '@/types/grading';
import { submitGradingReport } from '@/lib/report-service';
import { getSessionStoragePath, getSubmissionStoragePath } from '@/lib/persistence-service';

interface ReportIssueModalProps {
  submission: StudentSubmission;
  sessionId: string;
  userId: string;
  answerKeyStructure: AnswerKeyStructure;
  onClose: () => void;
}

export function ReportIssueModal({
  submission,
  sessionId,
  userId,
  answerKeyStructure,
  onClose,
}: ReportIssueModalProps) {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (!submission.score || !submission.results) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // DB에서 storage path 직접 조회, 없으면 예측 경로로 Storage 확인
      const [answerKeyPath, submissionPath] = await Promise.all([
        getSessionStoragePath(userId, sessionId),
        getSubmissionStoragePath(userId, sessionId, submission.id),
      ]);

      await submitGradingReport({
        userId,
        sessionId,
        submissionId: submission.id,
        studentName: submission.studentName,
        score: submission.score,
        resultsSnapshot: submission.results,
        answerKeyStructure,
        answerKeyStoragePath: answerKeyPath || '',
        submissionStoragePath: submissionPath || '',
        comment: comment.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Failed to submit report:', err);
      setError('제보 제출에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">제보가 접수되었습니다</h2>
            <p className="text-sm text-gray-500">확인 후 개선하겠습니다. 감사합니다!</p>
            <Button variant="ghost" onClick={onClose} className="mt-2">
              닫기
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col items-center text-center space-y-5">
          {/* Icon */}
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>

          {/* Title */}
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-gray-900">채점 오류 제보</h2>
            <p className="text-sm text-gray-500">
              채점 결과에 문제가 있나요? 아래 정보와 함께 제보됩니다.
            </p>
          </div>

          {/* Summary */}
          <div className="w-full bg-gray-50 rounded-lg p-4 text-left text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">학생</span>
              <span className="font-medium text-gray-800">{submission.studentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">점수</span>
              <span className="font-medium text-gray-800">
                {submission.score?.correct} / {submission.score?.total} ({Math.round(submission.score?.percentage ?? 0)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">문항 수</span>
              <span className="font-medium text-gray-800">{submission.results?.length ?? 0}문항</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">첨부</span>
              <span className="font-medium text-gray-800">정답지 PDF, 시험지 PDF</span>
            </div>
          </div>

          {/* Comment */}
          <div className="w-full text-left">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              어떤 부분이 이상한가요? (선택)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="예: 3번 문제의 정답이 잘못 인식된 것 같아요"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="w-full pt-1">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full h-10 rounded-md font-medium text-base text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  제출 중...
                </>
              ) : (
                '제보하기'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
