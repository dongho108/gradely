"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTabStore } from "@/store/use-tab-store";
import { useAuthStore } from "@/store/use-auth-store";
import { useUserPreferencesStore } from "@/store/use-user-preferences-store";
import { LoginPromptModal } from "@/components/auth/login-prompt-modal";
import { ExamRail } from "./exam-rail";
import { SubmissionListV2, type ResultView } from "./submission-list-v2";
import { GradingResultPanelV2 } from "./grading-result-panel-v2";
import { AnswerKeyPanelV2 } from "./answer-key-panel-v2";
import { ReportIssueModalV2 } from "./report-issue-modal-v2";
import {
  calculateGradingResult,
  extractExamStructureFromImages,
  toggleCorrectStatus,
} from "@/lib/grading-service";
import { filesToImages } from "@/lib/file-utils";
import { resolveFile } from "@/lib/file-resolver";
import { uploadAndTrackSubmission } from "@/lib/auto-save";
import type { GradingStrictness, StudentSubmission } from "@/types/grading";

const PDFViewer = dynamic(
  () => import("@/features/grader/components/pdf-viewer").then((m) => m.PDFViewer),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--wds-label-assistive)",
        }}
      >
        PDF 엔진 로딩 중...
      </div>
    ),
  },
);

interface GradingWorkspaceV2Props {
  onScanClick: () => void;
}

export function GradingWorkspaceV2({ onScanClick }: GradingWorkspaceV2Props) {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const submissions = useTabStore((s) => s.submissions);
  const addSubmission = useTabStore((s) => s.addSubmission);
  const updateSubmissionGrade = useTabStore((s) => s.updateSubmissionGrade);
  const setSubmissionStatus = useTabStore((s) => s.setSubmissionStatus);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const tabId = activeTab?.id ?? null;
  const tabSubs = tabId ? submissions[tabId] || [] : [];

  const [view, setView] = useState<ResultView>({ kind: "answer-key" });
  const [showLogin, setShowLogin] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [pdfViewerSubmission, setPdfViewerSubmission] = useState<StudentSubmission | null>(null);
  const [resolvedSubmissionFiles, setResolvedSubmissionFiles] = useState<File[] | undefined>(
    undefined,
  );

  // Reset view when active tab changes
  useEffect(() => {
    setView({ kind: "answer-key" });
    setPdfViewerSubmission(null);
  }, [tabId]);

  // Resolve answer key files
  const [answerKeyFiles, setAnswerKeyFiles] = useState<File[] | undefined>(undefined);
  useEffect(() => {
    if (!activeTab?.answerKeyFile) {
      setAnswerKeyFiles(undefined);
      return;
    }
    const akf = activeTab.answerKeyFile;
    if (akf.fileRefs && akf.fileRefs.length > 0) {
      setAnswerKeyFiles(akf.fileRefs);
      return;
    }
    if (akf.storagePath) {
      resolveFile(akf.storagePath, akf.name)
        .then((f) => setAnswerKeyFiles([f]))
        .catch((err) => console.error("[GradingWorkspaceV2] resolveFile failed:", err));
    }
  }, [activeTab?.id, activeTab?.answerKeyFile?.fileRefs, activeTab?.answerKeyFile?.storagePath]);

  // Resolve current submission files when viewing PDF
  const currentSubmission =
    view.kind === "student"
      ? tabSubs.find((s) => s.id === view.submissionId) ?? null
      : null;

  useEffect(() => {
    if (!pdfViewerSubmission) {
      setResolvedSubmissionFiles(undefined);
      return;
    }
    if (pdfViewerSubmission.fileRefs && pdfViewerSubmission.fileRefs.length > 0) {
      setResolvedSubmissionFiles(pdfViewerSubmission.fileRefs);
      return;
    }
    if (pdfViewerSubmission.storagePath) {
      resolveFile(pdfViewerSubmission.storagePath, pdfViewerSubmission.fileName)
        .then((f) => setResolvedSubmissionFiles([f]))
        .catch((err) => console.error("[GradingWorkspaceV2] resolveFile failed:", err));
    }
  }, [pdfViewerSubmission?.id]);

  // Grading queue
  const MAX_CONCURRENT = 20;
  const processingRef = useRef<{ queue: string[]; activeCount: number }>({
    queue: [],
    activeCount: 0,
  });

  const processOne = async (subId: string) => {
    if (!tabId) return;
    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    const structure = tab?.answerKeyStructure;
    if (!structure) return;

    setSubmissionStatus(tabId, subId, "grading");
    try {
      const sub = useTabStore.getState().submissions[tabId]?.find((s) => s.id === subId);
      if (!sub) throw new Error("submission not found");

      let files = sub.fileRefs;
      if ((!files || files.length === 0) && sub.storagePath) {
        const resolved = await resolveFile(sub.storagePath, sub.fileName);
        files = [resolved];
      }
      if (!files || files.length === 0) throw new Error("no file");

      let exam = sub.preExtractedStructure;
      if (!exam) {
        const images = await filesToImages(files);
        exam = await extractExamStructureFromImages(images);
      }
      const strictness: GradingStrictness =
        tab.gradingStrictness ??
        useUserPreferencesStore.getState().defaultGradingStrictness ??
        "standard";
      const result = await calculateGradingResult(subId, structure, exam, strictness);
      updateSubmissionGrade(tabId, subId, result);
    } catch (err) {
      console.error("[GradingWorkspaceV2] grading failed:", err);
      setSubmissionStatus(tabId, subId, "pending");
    }
  };

  const drain = () => {
    while (
      processingRef.current.queue.length > 0 &&
      processingRef.current.activeCount < MAX_CONCURRENT
    ) {
      const id = processingRef.current.queue.shift()!;
      processingRef.current.activeCount++;
      processOne(id).finally(() => {
        processingRef.current.activeCount--;
        if (processingRef.current.queue.length > 0) drain();
      });
    }
  };

  // Auto-pick up queued submissions
  useEffect(() => {
    if (!tabId) return;
    const queued = tabSubs.filter((s) => s.status === "queued");
    if (queued.length === 0) return;
    const newIds = queued
      .map((s) => s.id)
      .filter((id) => !processingRef.current.queue.includes(id));
    if (newIds.length === 0) return;
    processingRef.current.queue.push(...newIds);
    drain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, tabSubs]);

  const handleSelectStudent = (sub: StudentSubmission) => {
    setView({ kind: "student", submissionId: sub.id });
  };

  // 수동 편집 시 AI 재채점은 건너뛰고 텍스트만 즉시 반영. 정/오답은
  // 그대로 두고, 필요하면 사용자가 OX 배지로 직접 토글한다.
  const handleAnswerEdit = (questionNumber: number, newAnswer: string) => {
    if (!tabId || !currentSubmission?.results || !currentSubmission.score) return;
    const updatedResults = currentSubmission.results.map((r) =>
      r.questionNumber === questionNumber
        ? { ...r, studentAnswer: newAnswer, isEdited: true }
        : r,
    );
    updateSubmissionGrade(tabId, currentSubmission.id, {
      submissionId: currentSubmission.id,
      studentName: currentSubmission.studentName,
      score: currentSubmission.score,
      results: updatedResults,
    });
  };

  const handleCorrectToggle = (questionNumber: number, newIsCorrect: boolean) => {
    if (!tabId || !currentSubmission?.results) return;
    const updated = toggleCorrectStatus(
      currentSubmission.id,
      currentSubmission.results,
      questionNumber,
      newIsCorrect,
      currentSubmission.studentName,
    );
    updateSubmissionGrade(tabId, currentSubmission.id, updated);
  };

  const handleStudentNameEdit = (newName: string) => {
    if (!tabId || !currentSubmission?.results || !currentSubmission.score) return;
    updateSubmissionGrade(tabId, currentSubmission.id, {
      submissionId: currentSubmission.id,
      studentName: newName,
      score: currentSubmission.score,
      results: currentSubmission.results,
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleAddSubmissions = async (files: FileList | File[]) => {
    if (!tabId || !files) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    const ids: string[] = [];
    for (const file of Array.from(files)) {
      if (!allowed.includes(file.type)) continue;
      const id = Math.random().toString(36).substring(2, 9);
      addSubmission(tabId, file, id);
      setSubmissionStatus(tabId, id, "queued");
      ids.push(id);
      if (user?.id) uploadAndTrackSubmission(user.id, tabId, id, file);
    }
    processingRef.current.queue.push(...ids);
    drain();
  };

  if (!tabId || !activeTab) {
    return (
      <div className="g-empty">
        <div className="g-empty-card">
          <div className="g-empty-icon">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div className="wds-headline2 wds-bold-body">시험을 시작해 보세요</div>
          <p className="wds-caption1" style={{ color: "var(--wds-label-alternative)" }}>
            좌측 상단에서 새 시험을 추가하거나 답안지 스캔으로 진입하세요.
          </p>
        </div>
      </div>
    );
  }

  // For tabs without answer key yet, show scan/upload entry
  if (activeTab.status === "idle" || activeTab.status === "extracting") {
    return (
      <div className="g-empty">
        <div className="g-empty-card">
          <div className="g-empty-icon">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div className="wds-headline2 wds-bold-body">
            {activeTab.status === "extracting"
              ? "정답지를 분석하는 중..."
              : "정답지를 등록해 주세요"}
          </div>
          <p className="wds-caption1" style={{ color: "var(--wds-label-alternative)" }}>
            상단의 <b>스캔</b> 탭에서 정답지를 스캔하거나 PDF로 업로드하세요.
          </p>
          <button type="button" className="g-btn g-btn-md g-btn-primary" onClick={onScanClick}>
            스캔 화면으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="g-frame-main">
      <ExamRail onNewExamClick={onScanClick} />
      <SubmissionListV2
        tabId={tabId}
        view={view}
        onSelectAnswerKey={() => setView({ kind: "answer-key" })}
        onSelectStudent={handleSelectStudent}
        onScanClick={() => {
          if (!isAuthenticated && tabSubs.length >= 1) {
            setShowLogin(true);
            return;
          }
          if (!fileInputRef.current) return;
          fileInputRef.current.click();
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="application/pdf, image/jpeg, image/png"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files) handleAddSubmissions(e.target.files);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />

      {pdfViewerSubmission ? (
        <section className="g-result">
          <div className="g-result-head">
            <div className="g-result-info">
              <div className="name">{pdfViewerSubmission.studentName} · 원본</div>
              <div className="sub">{pdfViewerSubmission.fileName}</div>
            </div>
            <button
              type="button"
              className="g-btn g-btn-sm g-btn-outline"
              onClick={() => setPdfViewerSubmission(null)}
            >
              닫기
            </button>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <PDFViewer
              file={resolvedSubmissionFiles ?? answerKeyFiles ?? []}
              className="h-full"
            />
          </div>
        </section>
      ) : view.kind === "answer-key" ? (
        <AnswerKeyPanelV2
          tabId={tabId}
          pdfFiles={answerKeyFiles}
          renderPdfViewer={(files) => <PDFViewer file={files} className="h-full" />}
        />
      ) : currentSubmission ? (
        <GradingResultPanelV2
          tabId={tabId}
          submission={currentSubmission}
          onOpenAnswerKey={() => setView({ kind: "answer-key" })}
          onViewOriginal={() => setPdfViewerSubmission(currentSubmission)}
          onAnswerEdit={handleAnswerEdit}
          onCorrectToggle={handleCorrectToggle}
          onStudentNameEdit={handleStudentNameEdit}
          onReportIssue={
            currentSubmission.status === "graded" && currentSubmission.results
              ? () => {
                  if (!isAuthenticated || !user) {
                    setShowLogin(true);
                    return;
                  }
                  setShowReport(true);
                }
              : undefined
          }
        />
      ) : (
        <section className="g-result">
          <div className="g-empty">
            <div className="g-empty-card">
              <div className="wds-headline2 wds-bold-body">학생을 선택하세요</div>
            </div>
          </div>
        </section>
      )}

      {showLogin && (
        <LoginPromptModal
          onClose={() => setShowLogin(false)}
          onLogin={async () => {
            await signInWithGoogle();
            setShowLogin(false);
          }}
        />
      )}

      {showReport && currentSubmission && user && activeTab.answerKeyStructure && (
        <ReportIssueModalV2
          submission={currentSubmission}
          sessionId={tabId}
          userId={user.id}
          answerKeyStructure={activeTab.answerKeyStructure}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
