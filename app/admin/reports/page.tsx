"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { useAuthInit } from "@/hooks/use-auth-init";
import { GradingReport, loadAllReports, updateReportStatus, getReportFileUrl } from "@/lib/report-service";
import { QuestionResult } from "@/types/grading";
import { ChevronDown, ChevronUp, Download, FileText, Loader2 } from "lucide-react";

type StatusFilter = 'all' | 'open' | 'reviewed' | 'resolved';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: '미확인', color: 'bg-red-100 text-red-700' },
  reviewed: { label: '확인 중', color: 'bg-yellow-100 text-yellow-700' },
  resolved: { label: '해결됨', color: 'bg-green-100 text-green-700' },
};

export default function AdminReportsPage() {
  useAuthInit();
  const { user, isLoading: authLoading } = useAuthStore();
  const [reports, setReports] = useState<GradingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    loadReports();
  }, [user, authLoading]);

  const loadReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadAllReports();
      setReports(data);
    } catch (err) {
      console.error('Failed to load reports:', err);
      setError('제보 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: 'open' | 'reviewed' | 'resolved') => {
    try {
      await updateReportStatus(id, newStatus);
      setReports(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleNotesUpdate = async (id: string, notes: string) => {
    try {
      const report = reports.find(r => r.id === id);
      await updateReportStatus(id, report?.status ?? 'open', notes);
      setReports(prev => prev.map(r => r.id === id ? { ...r, developer_notes: notes } : r));
    } catch (err) {
      console.error('Failed to update notes:', err);
    }
  };

  const handleDownload = async (storagePath: string, fileName: string) => {
    try {
      const url = await getReportFileUrl(storagePath);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.target = '_blank';
      a.click();
    } catch (err) {
      console.error('Failed to get download URL:', err);
      alert('파일 다운로드에 실패했습니다.');
    }
  };

  const filteredReports = filter === 'all' ? reports : reports.filter(r => r.status === filter);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">로그인이 필요합니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">채점 오류 제보 목록</h1>
          <p className="text-sm text-gray-500 mt-1">사용자로부터 접수된 채점 오류 제보를 확인합니다.</p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {(['all', 'open', 'reviewed', 'resolved'] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === s
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {s === 'all' ? '전체' : STATUS_LABELS[s].label}
              {s !== 'all' && (
                <span className="ml-1.5 text-xs opacity-70">
                  ({reports.filter(r => r.status === s).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {/* Reports List */}
        {!loading && filteredReports.length === 0 && (
          <div className="text-center py-12 text-gray-400">접수된 제보가 없습니다.</div>
        )}

        <div className="space-y-3">
          {filteredReports.map(report => (
            <ReportCard
              key={report.id}
              report={report}
              isExpanded={expandedId === report.id}
              onToggle={() => setExpandedId(expandedId === report.id ? null : report.id)}
              onStatusChange={handleStatusChange}
              onNotesUpdate={handleNotesUpdate}
              onDownload={handleDownload}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Report Card Component ---

function ReportCard({
  report,
  isExpanded,
  onToggle,
  onStatusChange,
  onNotesUpdate,
  onDownload,
}: {
  report: GradingReport;
  isExpanded: boolean;
  onToggle: () => void;
  onStatusChange: (id: string, status: 'open' | 'reviewed' | 'resolved') => void;
  onNotesUpdate: (id: string, notes: string) => void;
  onDownload: (storagePath: string, fileName: string) => void;
}) {
  const [notes, setNotes] = useState(report.developer_notes ?? '');
  const statusInfo = STATUS_LABELS[report.status];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Summary Row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-4 min-w-0">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 truncate">
              {report.student_name}
              <span className="ml-2 text-sm font-normal text-gray-500">
                {report.score_correct}/{report.score_total} ({Math.round(report.score_percentage ?? 0)}%)
              </span>
            </p>
            {report.comment && (
              <p className="text-sm text-gray-500 truncate mt-0.5">{report.comment}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-400">
            {new Date(report.created_at).toLocaleString('ko-KR')}
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Expanded Detail */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-5 space-y-6">
          {/* Comment */}
          {report.comment && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">사용자 코멘트</h4>
              <p className="text-sm text-gray-600 bg-amber-50 p-3 rounded-lg">{report.comment}</p>
            </div>
          )}

          {/* PDF Downloads */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">첨부 파일</h4>
            <div className="flex gap-3">
              <button
                onClick={() => onDownload(report.answer_key_storage_path, '정답지.pdf')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition-colors"
              >
                <Download className="w-4 h-4" />
                정답지 PDF
              </button>
              <button
                onClick={() => onDownload(report.submission_storage_path, '시험지.pdf')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition-colors"
              >
                <Download className="w-4 h-4" />
                시험지 PDF
              </button>
            </div>
          </div>

          {/* Answer Key Structure */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              <FileText className="w-4 h-4 inline mr-1" />
              정답지 구조
            </h4>
            <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase">
                    <th className="text-left pb-2 w-12">#</th>
                    <th className="text-left pb-2">정답</th>
                    <th className="text-left pb-2">문제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {Object.entries(report.answer_key_structure.answers).map(([num, entry]) => (
                    <tr key={num}>
                      <td className="py-1.5 font-medium text-gray-700">{num}</td>
                      <td className="py-1.5 text-gray-800">{(entry as { text: string; question?: string }).text}</td>
                      <td className="py-1.5 text-gray-500">{(entry as { text: string; question?: string }).question || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Grading Results Snapshot */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">채점 결과 스냅샷</h4>
            <div className="bg-gray-50 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr className="text-gray-600 text-xs uppercase">
                    <th className="px-3 py-2 text-left w-12">#</th>
                    <th className="px-3 py-2 text-left">문제</th>
                    <th className="px-3 py-2 text-left">학생 답안</th>
                    <th className="px-3 py-2 text-left">정답</th>
                    <th className="px-3 py-2 text-center w-16">결과</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(report.results_snapshot as QuestionResult[]).map((r) => (
                    <tr key={r.questionNumber} className={r.isCorrect ? 'bg-green-50/50' : 'bg-red-50/50'}>
                      <td className="px-3 py-2 font-medium">{r.questionNumber}</td>
                      <td className="px-3 py-2 text-gray-500">{r.question || '-'}</td>
                      <td className="px-3 py-2">{r.studentAnswer || '-'}</td>
                      <td className="px-3 py-2">{r.correctAnswer || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block w-6 h-6 rounded-full text-white text-xs font-bold leading-6 ${r.isCorrect ? 'bg-green-500' : 'bg-red-500'}`}>
                          {r.isCorrect ? 'O' : 'X'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Status Change */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">상태 변경</h4>
            <div className="flex gap-2">
              {(['open', 'reviewed', 'resolved'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => onStatusChange(report.id, s)}
                  disabled={report.status === s}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    report.status === s
                      ? `${STATUS_LABELS[s].color} ring-2 ring-offset-1 ring-gray-300`
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {STATUS_LABELS[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Developer Notes */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">개발자 메모</h4>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (report.developer_notes ?? '')) {
                  onNotesUpdate(report.id, notes);
                }
              }}
              placeholder="원인 분석, 해결 방법 등을 메모하세요..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
