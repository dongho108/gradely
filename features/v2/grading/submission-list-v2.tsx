"use client";

import { FileText, Trash2 } from "lucide-react";
import { useTabStore } from "@/store/use-tab-store";
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

  const handleDelete = (e: React.MouseEvent, sub: StudentSubmission) => {
    e.stopPropagation();
    if (!confirm(`${sub.studentName} 학생의 답안지를 삭제할까요?\n\n스캔본과 채점 결과가 함께 삭제됩니다.`)) {
      return;
    }
    removeSubmission(tabId, sub.id);
  };

  return (
    <section className="g-students">
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
            답안지 스캔 또는 PDF 업로드로 추가하세요
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
    </section>
  );
}
