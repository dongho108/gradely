"use client";

import React, { useEffect, useState } from 'react';
import { History, RotateCcw, Trash2, X, Loader2 } from 'lucide-react';
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
import { deleteSessionFiles } from '@/lib/storage-service';
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
      await deleteSessionFiles(user.id, session.id).catch(() => {
        // Storage cleanup is best-effort
      });
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-bold text-gray-900">세션 히스토리</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 pt-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <History className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p>닫은 세션이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="border rounded-xl p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-gray-900 truncate">{session.title}</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        생성: {formatDate(new Date(session.created_at).toISOString())}
                        {' · '}
                        닫음: {formatDate(session.archived_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(session)}
                        disabled={restoringId === session.id}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 px-2.5"
                      >
                        {restoringId === session.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                        <span className="ml-1 text-xs">복원</span>
                      </Button>

                      {confirmDeleteId === session.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(session)}
                            disabled={deletingId === session.id}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2.5"
                          >
                            {deletingId === session.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <span className="text-xs">확인</span>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-gray-500 h-8 px-2.5"
                          >
                            <span className="text-xs">취소</span>
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeleteId(session.id)}
                          className="text-gray-400 hover:text-red-600 hover:bg-red-50 h-8 px-2.5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
