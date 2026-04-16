"use client";

import React, { useEffect, useState } from 'react';
import { History, RotateCcw, Trash2, X, Loader2, CheckCircle2, Clock, FileText, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/use-auth-store';
import { useTabStore, StoreExamSession } from '@/store/use-tab-store';
import {
  loadArchivedSessions,
  loadSessionSubmissions,
  restoreSession as restoreSessionDB,
  deleteSession,
  PersistedExamSession,
} from '@/lib/persistence-service';
import { StudentSubmission } from '@/types/grading';

interface SessionHistoryModalProps {
  onClose: () => void;
}

export const SessionHistoryModal: React.FC<SessionHistoryModalProps> = ({ onClose }) => {
  const user = useAuthStore((s) => s.user);
  const restoreSession = useTabStore((s) => s.restoreSession);

  const [sessions, setSessions] = useState<PersistedExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    loadArchivedSessions(user.id)
      .then(setSessions)
      .catch(() => setError('세션 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const handleRestore = async (session: PersistedExamSession) => {
    if (!user?.id) return;
    setRestoringId(session.id);
    try {
      await restoreSessionDB(session.id);

      const dbSubs = await loadSessionSubmissions(session.id);
      const storeSession: StoreExamSession = {
        id: session.id,
        title: session.title,
        createdAt: session.created_at,
        status: session.status as 'idle' | 'ready',
        answerKeyFile: session.answer_key_file_name
          ? {
              name: session.answer_key_file_name,
              size: session.answer_key_file_size ?? 0,
              storagePath: session.answer_key_storage_path ?? undefined,
            }
          : undefined,
        answerKeyStructure: session.answer_key_structure ?? undefined,
        gradingStrictness: session.grading_strictness ?? undefined,
      };

      const storeSubs: StudentSubmission[] = dbSubs.map((sub) => ({
        id: sub.id,
        studentName: sub.student_name,
        fileName: sub.file_name,
        storagePath: sub.storage_path ?? undefined,
        status: sub.status as 'pending' | 'graded',
        score:
          sub.score_correct != null && sub.score_total != null && sub.score_percentage != null
            ? { correct: sub.score_correct, total: sub.score_total, percentage: sub.score_percentage }
            : undefined,
        results: sub.results ?? undefined,
        uploadedAt: sub.uploaded_at,
      }));

      restoreSession(storeSession, storeSubs);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch {
      setError('세션 복원에 실패했습니다.');
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (session: PersistedExamSession) => {
    if (!user?.id) return;
    setDeletingId(session.id);
    try {
      await deleteSession(session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      setConfirmDeleteId(null);
    } catch {
      setError('세션 삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isReady = (session: PersistedExamSession) => session.status === 'ready';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex flex-col items-center text-center pt-6 pb-4 px-6 border-b border-gray-100 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mb-3">
            <History className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">세션 히스토리</h2>
          <p className="text-xs text-gray-500 mt-1">닫은 세션을 복원하거나 영구 삭제할 수 있습니다</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-xs text-gray-400 mt-3">불러오는 중...</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <History className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-500">닫은 세션이 없습니다</p>
              <p className="text-xs text-gray-400 mt-1">탭을 닫으면 여기에 표시됩니다</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="border border-gray-200 rounded-xl overflow-hidden hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
                >
                  {/* Card Main */}
                  <div className="p-3.5 flex items-start gap-3">
                    {/* Status Icon */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      isReady(session) ? 'bg-green-50' : 'bg-amber-50'
                    }`}>
                      {isReady(session) ? (
                        <CheckCircle2 className="w-4.5 h-4.5 text-green-600" />
                      ) : (
                        <Clock className="w-4.5 h-4.5 text-amber-600" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-sm text-gray-900 truncate">{session.title}</h3>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {session.answer_key_structure && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            <FileText className="w-3 h-3" />
                            {session.answer_key_structure.totalQuestions}문항
                          </span>
                        )}
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          isReady(session)
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {isReady(session) ? '정답지 등록됨' : '미완료'}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1.5">
                        {formatDate(new Date(session.created_at).toISOString())} 생성
                        {' · '}
                        {formatDate(session.archived_at)} 닫음
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(session)}
                        disabled={restoringId === session.id}
                        className="text-primary hover:text-primary hover:bg-primary/10 h-8 px-2.5 gap-1"
                      >
                        {restoringId === session.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span className="text-xs">복원</span>
                      </Button>
                      {confirmDeleteId !== session.id && (
                        <button
                          onClick={() => setConfirmDeleteId(session.id)}
                          className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Delete Confirmation Expand */}
                  {confirmDeleteId === session.id && (
                    <div className="bg-red-50 border-t border-red-100 px-3.5 py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <p className="text-xs text-red-600 truncate">정답지, 시험지, 채점 결과가 모두 삭제됩니다</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(session)}
                          disabled={deletingId === session.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-100 h-7 px-2.5 text-xs"
                        >
                          {deletingId === session.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            '영구 삭제'
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-gray-500 hover:text-gray-700 h-7 px-2.5 text-xs"
                        >
                          취소
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
