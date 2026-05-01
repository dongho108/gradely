"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Trash2, UploadCloud } from "lucide-react";
import { useTabStore } from "@/store/use-tab-store";
import { useAuthStore } from "@/store/use-auth-store";
import { uploadAndTrackSubmission } from "@/lib/auto-save";
import { partitionFilesByAccepted } from "@/lib/submission-drop-utils";
import type { StudentSubmission } from "@/types/grading";
import { ScanFooterV2 } from "./scan-footer-v2";

export type ResultView =
  | { kind: "answer-key" }
  | { kind: "student"; submissionId: string }
  | { kind: "none" };

interface SubmissionListV2Props {
  tabId: string;
  view: ResultView;
  onSelectAnswerKey: () => void;
  onSelectStudent: (submission: StudentSubmission) => void;
}

function statusColor(pct: number): string {
  if (pct >= 85) return "var(--g-correct)";
  if (pct >= 60) return "var(--g-warn)";
  return "var(--g-wrong)";
}

const generateSubmissionId = () => Math.random().toString(36).substring(2, 9);

export function SubmissionListV2({
  tabId,
  view,
  onSelectAnswerKey,
  onSelectStudent,
}: SubmissionListV2Props) {
  const tabs = useTabStore((s) => s.tabs);
  const submissions = useTabStore((s) => s.submissions);
  const removeSubmission = useTabStore((s) => s.removeSubmission);
  const tab = tabs.find((t) => t.id === tabId);
  const list = submissions[tabId] || [];

  const isAnswerKey = view.kind === "answer-key";
  const selectedId = view.kind === "student" ? view.submissionId : null;

  const [isDragActive, setIsDragActive] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "info" | "error";
    text: string;
  } | null>(null);
  const dragCounterRef = useRef(0);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((kind: "info" | "error", text: string) => {
    setNotice({ kind, text });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const handleDelete = (e: React.MouseEvent, sub: StudentSubmission) => {
    e.stopPropagation();
    if (
      !confirm(
        `${sub.studentName} 학생의 답안지를 삭제할까요?\n\n스캔본과 채점 결과가 함께 삭제됩니다.`,
      )
    ) {
      return;
    }
    removeSubmission(tabId, sub.id);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLElement>) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragActive(false);

    const dropped = e.dataTransfer?.files
      ? Array.from(e.dataTransfer.files)
      : [];
    if (dropped.length === 0) return;

    if (!tab?.answerKeyStructure) {
      showNotice(
        "error",
        "정답지부터 등록해 주세요. 정답지 없이 학생 답안지를 채점할 수 없습니다.",
      );
      return;
    }

    const { accepted, rejected } = partitionFilesByAccepted(dropped);
    if (accepted.length === 0) {
      showNotice("error", "PDF 또는 이미지(JPG/PNG)만 업로드할 수 있습니다.");
      return;
    }

    const userId = useAuthStore.getState().user?.id;
    for (const file of accepted) {
      const id = generateSubmissionId();
      useTabStore.getState().addSubmission(tabId, [file], id);
      useTabStore.getState().setSubmissionStatus(tabId, id, "queued");
      if (userId) {
        // best-effort, fire-and-forget Storage upload for issue reports
        uploadAndTrackSubmission(userId, tabId, id, file).catch((err) =>
          console.error("[SubmissionListV2] uploadAndTrackSubmission failed:", err),
        );
      }
    }

    if (rejected.length > 0) {
      showNotice(
        "info",
        `${accepted.length}개 추가됨 · ${rejected.length}개 제외(지원하지 않는 형식).`,
      );
    } else {
      showNotice("info", `${accepted.length}개 답안지 추가 · 채점 대기열 등록.`);
    }
  };

  return (
    <section
      className={`g-students${isDragActive ? " is-drag-active" : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ position: "relative" }}
    >
      {notice && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            right: 8,
            zIndex: 30,
            padding: "8px 10px",
            borderRadius: "var(--wds-radius-md)",
            fontSize: 12,
            fontWeight: 600,
            background:
              notice.kind === "error"
                ? "var(--g-wrong-bg, #FEECEC)"
                : "var(--wds-blue-95)",
            color:
              notice.kind === "error"
                ? "var(--g-wrong, #DC2626)"
                : "var(--wds-label-strong)",
            border: `1px solid ${
              notice.kind === "error"
                ? "var(--g-wrong, #DC2626)"
                : "var(--wds-blue-90)"
            }`,
            boxShadow: "var(--wds-shadow-md, 0 2px 6px rgba(0,0,0,.06))",
          }}
        >
          {notice.text}
        </div>
      )}

      <div
        className={`g-student g-student-key ${isAnswerKey ? "is-active" : ""}`}
        onClick={onSelectAnswerKey}
        style={{ cursor: "pointer" }}
      >
        <div className="g-student-body">
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <FileText size={13} />
            <div className="g-student-name">정답지</div>
          </div>
          <div className="g-student-file">
            {tab?.answerKeyFile?.name || "정답지 미등록"}
            {tab?.answerKeyStructure
              ? ` · ${tab.answerKeyStructure.totalQuestions}문항`
              : ""}
          </div>
        </div>
      </div>

      <div className="g-students-head">
        <h3>학생 답안지</h3>
        <span className="count">{list.length}명</span>
      </div>

      <div className="g-students-list">
        {list.length === 0 ? (
          <div
            className="wds-caption1"
            style={{
              padding: "var(--wds-sp-24)",
              color: "var(--wds-label-assistive)",
              textAlign: "center",
            }}
          >
            답안지 스캔 또는 PDF 드래그앤드랍으로 추가하세요
          </div>
        ) : (
          list.map((sub) => {
            const isActive = selectedId === sub.id;
            const total = sub.score?.total ?? 0;
            const correct = sub.score?.correct ?? 0;
            const pct = total ? (correct / total) * 100 : 0;
            const color = statusColor(pct);

            return (
              <div
                key={sub.id}
                className={`g-student ${isActive ? "is-active" : ""}`}
                onClick={() => onSelectStudent(sub)}
                style={{ cursor: "pointer" }}
              >
                <button
                  type="button"
                  className="g-student-del"
                  title={`${sub.studentName} 답안지 삭제`}
                  onClick={(e) => handleDelete(e, sub)}
                >
                  <Trash2 size={12} />
                </button>
                <div className="g-student-body">
                  <div className="g-student-name">{sub.studentName}</div>
                  <div className="g-student-file">{sub.fileName}</div>
                  {sub.status === "graded" && sub.score ? (
                    <div className="g-student-score">
                      <div className="g-score-bar">
                        <span style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {correct}/{total}
                      </span>
                    </div>
                  ) : sub.status === "grading" ? (
                    <span
                      className="g-chip g-chip-blue"
                      style={{ alignSelf: "flex-start", marginTop: 6 }}
                    >
                      <span className="g-dot g-dot-blue" />
                      채점 중
                    </span>
                  ) : sub.status === "queued" ? (
                    <span
                      className="g-chip g-chip-violet"
                      style={{ alignSelf: "flex-start", marginTop: 6 }}
                    >
                      <span className="g-dot g-dot-violet" />
                      대기 중
                    </span>
                  ) : (
                    <span
                      className="g-chip g-chip-gray"
                      style={{ alignSelf: "flex-start", marginTop: 6 }}
                    >
                      대기 중
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ScanFooterV2 tabId={tabId} />

      {isDragActive && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 6,
            zIndex: 25,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "rgba(60, 130, 246, 0.08)",
            border: "2px dashed var(--wds-blue-70, #3B82F6)",
            borderRadius: "var(--wds-radius-lg, 12px)",
            backdropFilter: "blur(2px)",
            color: "var(--wds-blue-50, #1D4ED8)",
            pointerEvents: "none",
          }}
        >
          <UploadCloud size={28} />
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            여기에 답안지 파일을 놓으세요
          </div>
          <div style={{ fontSize: 11, color: "var(--wds-label-alternative)" }}>
            PDF · JPG · PNG 지원 · 1 파일 = 1 학생
          </div>
        </div>
      )}
    </section>
  );
}
