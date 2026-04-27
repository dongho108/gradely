"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Eye, Filter, Flag, Loader2, Pencil, Sparkles, X } from "lucide-react";
import type { StudentSubmission, GradingStrictness } from "@/types/grading";
import { useTabStore } from "@/store/use-tab-store";
import { useUserPreferencesStore } from "@/store/use-user-preferences-store";

interface GradingResultPanelV2Props {
  tabId: string;
  submission: StudentSubmission;
  onReportIssue?: () => void;
  onOpenAnswerKey: () => void;
  onViewOriginal?: () => void;
  onAnswerEdit?: (questionNumber: number, newAnswer: string) => void | Promise<void>;
  onCorrectToggle?: (questionNumber: number, isCorrect: boolean) => void;
  onStudentNameEdit?: (newName: string) => void;
}

const STRICTNESS_OPTIONS: ReadonlyArray<{
  id: GradingStrictness;
  label: string;
  desc: string;
  dot: string;
}> = [
  { id: "strict", label: "엄격", desc: "정확히 일치하는 답안만 정답 처리", dot: "var(--g-wrong)" },
  { id: "standard", label: "보통", desc: "오타 1글자까지 정답 인정", dot: "var(--wds-primary)" },
  { id: "lenient", label: "관대", desc: "유사 표현·동의어까지 정답 인정", dot: "var(--g-correct)" },
];

function statusTone(pct: number): { color: string; bg: string } {
  if (pct >= 85) return { color: "var(--g-correct)", bg: "var(--g-correct-bg)" };
  if (pct >= 60) return { color: "var(--g-warn)", bg: "var(--g-warn-bg)" };
  return { color: "var(--g-wrong)", bg: "var(--g-wrong-bg)" };
}

export function GradingResultPanelV2({
  tabId,
  submission,
  onReportIssue,
  onOpenAnswerKey,
  onViewOriginal,
  onAnswerEdit,
  onCorrectToggle,
  onStudentNameEdit,
}: GradingResultPanelV2Props) {
  const tabs = useTabStore((s) => s.tabs);
  const tab = tabs.find((t) => t.id === tabId);
  const userDefault = useUserPreferencesStore((s) => s.defaultGradingStrictness);
  const effectiveStrictness: GradingStrictness =
    tab?.gradingStrictness ?? userDefault ?? "standard";
  const currentMode =
    STRICTNESS_OPTIONS.find((m) => m.id === effectiveStrictness) ?? STRICTNESS_OPTIONS[1];

  const [modeOpen, setModeOpen] = useState(false);
  const [wrongOnly, setWrongOnly] = useState(false);
  const modeRef = useRef<HTMLDivElement>(null);

  const [editingQ, setEditingQ] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  // 낙관적 인디케이터 — onAnswerEdit가 끝날 때까지 카드에 새 값 + 스피너 노출
  const [pendingEdits, setPendingEdits] = useState<Record<number, string>>({});

  const startEditAnswer = (qNum: number, current: string) => {
    if (!onAnswerEdit) return;
    setEditingQ(qNum);
    setEditValue(current);
  };
  const confirmEditAnswer = () => {
    const qNum = editingQ;
    const newVal = editValue;
    setEditingQ(null);
    setEditValue("");
    if (qNum == null || !onAnswerEdit) return;
    const orig = (submission.results ?? []).find((r) => r.questionNumber === qNum)
      ?.studentAnswer ?? "";
    if (newVal === orig) return;

    setPendingEdits((prev) => ({ ...prev, [qNum]: newVal }));
    Promise.resolve(onAnswerEdit(qNum, newVal)).finally(() => {
      setPendingEdits((prev) => {
        const next = { ...prev };
        delete next[qNum];
        return next;
      });
    });
  };
  const cancelEditAnswer = () => {
    setEditingQ(null);
    setEditValue("");
  };

  const startEditName = () => {
    if (!onStudentNameEdit) return;
    setEditingName(true);
    setNameValue(submission.studentName);
  };
  const confirmEditName = () => {
    if (onStudentNameEdit && nameValue.trim() !== "" && nameValue !== submission.studentName) {
      onStudentNameEdit(nameValue.trim());
    }
    setEditingName(false);
  };

  useEffect(() => {
    if (!modeOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) setModeOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [modeOpen]);

  const results = submission.results ?? [];
  const totalCount = submission.score?.total ?? results.length;
  const correctCount = submission.score?.correct ?? results.filter((r) => r.isCorrect).length;
  const pct = submission.score?.percentage ?? (totalCount ? (correctCount / totalCount) * 100 : 0);
  const pctRounded = Math.round(pct);
  const tone = statusTone(pctRounded);
  const wrongCount = useMemo(() => results.filter((r) => !r.isCorrect).length, [results]);
  const visible = wrongOnly ? results.filter((r) => !r.isCorrect) : results;

  const isProcessing = submission.status !== "graded";

  return (
    <section className="g-result">
      <div className="g-result-head">
        <div className="g-result-student">
          <div className="g-result-info">
            {editingName ? (
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmEditName();
                  else if (e.key === "Escape") setEditingName(false);
                }}
                onBlur={confirmEditName}
                autoFocus
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: "-.015em",
                  color: "var(--wds-label-strong)",
                  border: "none",
                  borderBottom: "1.5px solid var(--wds-primary)",
                  outline: "none",
                  background: "transparent",
                  fontFamily: "inherit",
                  width: 180,
                }}
              />
            ) : (
              <div
                className="name"
                onClick={startEditName}
                style={{
                  cursor: onStudentNameEdit ? "pointer" : "default",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
                title={onStudentNameEdit ? "클릭하여 이름 수정" : undefined}
              >
                {submission.studentName}
                {onStudentNameEdit && (
                  <Pencil
                    size={12}
                    style={{ color: "var(--wds-label-assistive)" }}
                  />
                )}
              </div>
            )}
            <div className="sub">
              {tab?.title ? `${tab.title} · ` : ""}
              {submission.fileName}
            </div>
          </div>
        </div>

        {submission.status === "graded" && submission.score ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div className="g-result-score">
              <span className="big">{correctCount}</span>
              <span className="slash">/</span>
              <span className="total">{totalCount}</span>
              <span
                className="g-result-pct"
                style={{ background: tone.bg, color: tone.color }}
              >
                {pctRounded}%
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div className="g-mode-pill-wrap" ref={modeRef}>
                <button
                  type="button"
                  className="g-mode-pill"
                  onClick={onOpenAnswerKey}
                  title="정답지 패널에서 채점 모드 변경"
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 99,
                      background: currentMode.dot,
                      display: "inline-block",
                    }}
                  />
                  <span style={{ color: "var(--wds-label-alternative)", fontWeight: 500 }}>
                    채점 모드
                  </span>
                  <span style={{ color: "var(--wds-label-strong)", fontWeight: 700 }}>
                    {currentMode.label}
                  </span>
                  <ChevronDown size={11} />
                </button>
              </div>
              {onViewOriginal && (
                <button
                  type="button"
                  className="g-btn g-btn-sm g-btn-outline"
                  onClick={onViewOriginal}
                >
                  <Eye size={13} />
                  원본
                </button>
              )}
              {onReportIssue && (
                <button
                  type="button"
                  className="g-btn g-btn-sm g-btn-outline g-btn-report"
                  onClick={onReportIssue}
                >
                  <Flag size={13} />
                  오류 제보
                </button>
              )}
            </div>
          </div>
        ) : (
          <span
            className={`g-chip ${
              submission.status === "grading"
                ? "g-chip-blue"
                : submission.status === "queued"
                  ? "g-chip-violet"
                  : "g-chip-gray"
            }`}
            style={{ height: 28, padding: "0 var(--wds-sp-12)", fontSize: "0.8125rem" }}
          >
            {submission.status === "grading" && <span className="g-dot g-dot-blue" />}
            {submission.status === "queued" && <span className="g-dot g-dot-violet" />}
            {submission.status === "grading"
              ? "채점 중"
              : submission.status === "queued"
                ? "대기 중"
                : "처리 대기"}
          </span>
        )}
      </div>

      {isProcessing ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--wds-sp-40)",
            background: "var(--wds-cool-99)",
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: "100%",
              background: "var(--wds-bg-elevated)",
              border: "1px solid var(--wds-line-solid)",
              borderRadius: "var(--wds-radius-lg)",
              padding: "var(--wds-sp-24) var(--wds-sp-24) var(--wds-sp-20)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--wds-sp-16)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--wds-sp-10)" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "var(--wds-radius-md)",
                  background:
                    submission.status === "grading"
                      ? "var(--wds-blue-95)"
                      : "var(--wds-cool-98)",
                  color:
                    submission.status === "grading"
                      ? "var(--wds-primary)"
                      : "var(--wds-label-alternative)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  className="wds-headline2 wds-bold-body"
                  style={{ color: "var(--wds-label-strong)" }}
                >
                  {submission.status === "grading"
                    ? "AI가 채점하고 있어요"
                    : submission.status === "queued"
                      ? "대기열에 있어요"
                      : "처리를 기다리는 중이에요"}
                </div>
                <div
                  className="wds-caption1"
                  style={{
                    color: "var(--wds-label-alternative)",
                    marginTop: "var(--wds-sp-2)",
                  }}
                >
                  {submission.status === "grading"
                    ? "정답지와 비교하고 점수를 계산합니다"
                    : "앞선 작업이 끝나면 자동으로 시작됩니다"}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="g-result-toolbar">
            <div className="g-result-toolbar-left">
              <span className="wds-label2" style={{ color: "var(--wds-label-alternative)" }}>
                {wrongOnly ? (
                  <>
                    오답{" "}
                    <b style={{ color: "var(--g-wrong)", fontVariantNumeric: "tabular-nums" }}>
                      {wrongCount}
                    </b>
                    문항
                  </>
                ) : (
                  <>
                    총{" "}
                    <b
                      style={{
                        color: "var(--wds-label-strong)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {results.length}
                    </b>
                    문항
                  </>
                )}
              </span>
            </div>
            <div className="g-result-toolbar-right">
              <button
                type="button"
                className={`g-filter-toggle ${wrongOnly ? "is-active" : ""}`}
                onClick={() => setWrongOnly((v) => !v)}
                disabled={wrongCount === 0}
              >
                <Filter size={12} />
                오답만
                <span className="g-filter-count">{wrongCount}</span>
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflow: "auto" }}>
            {visible.length === 0 ? (
              <div
                style={{
                  padding: "var(--wds-sp-40)",
                  textAlign: "center",
                  color: "var(--wds-label-assistive)",
                }}
                className="wds-caption1"
              >
                {wrongOnly ? "오답이 없어요" : "채점 결과가 없어요"}
              </div>
            ) : (
              <div className="g-qgrid">
                {visible.map((r) => {
                  const pending = pendingEdits[r.questionNumber];
                  const isPending = pending !== undefined;
                  return (
                  <div
                    key={r.questionNumber}
                    className={`g-qcard ${r.isCorrect && !isPending ? "" : isPending ? "" : "is-wrong"}`}
                    style={isPending ? { opacity: 0.7 } : undefined}
                  >
                    <div className="g-qcard-head">
                      <span className="g-qcard-num">
                        Q {String(r.questionNumber).padStart(2, "0")}
                      </span>
                      {isPending ? (
                        <span
                          className="g-ox"
                          style={{
                            width: 24,
                            height: 24,
                            background: "var(--wds-cool-95)",
                            color: "var(--wds-label-alternative)",
                          }}
                          title="채점 중..."
                        >
                          <Loader2 size={12} className="animate-spin" />
                        </span>
                      ) : onCorrectToggle ? (
                        <button
                          type="button"
                          className={`g-ox ${r.isCorrect ? "correct" : "wrong"}`}
                          style={{
                            width: 24,
                            height: 24,
                            fontSize: 12,
                            border: 0,
                            cursor: "pointer",
                          }}
                          onClick={() => onCorrectToggle(r.questionNumber, !r.isCorrect)}
                          title={r.isCorrect ? "클릭하여 오답으로 변경" : "클릭하여 정답으로 변경"}
                        >
                          {r.isCorrect ? (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 8l3 3 7-7" />
                            </svg>
                          ) : (
                            <X size={12} />
                          )}
                        </button>
                      ) : (
                        <span
                          className={`g-ox ${r.isCorrect ? "correct" : "wrong"}`}
                          style={{ width: 24, height: 24, fontSize: 12 }}
                        >
                          {r.isCorrect ? (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 8l3 3 7-7" />
                            </svg>
                          ) : (
                            <X size={12} />
                          )}
                        </span>
                      )}
                    </div>
                    {r.question && <div className="g-qcard-q">{r.question}</div>}
                    <div className="g-qcard-ans">
                      <span className="lbl">학생</span>
                      {editingQ === r.questionNumber ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") confirmEditAnswer();
                            else if (e.key === "Escape") cancelEditAnswer();
                          }}
                          onBlur={confirmEditAnswer}
                          autoFocus
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            border: "1px solid var(--wds-primary)",
                            borderRadius: 4,
                            padding: "2px 6px",
                            outline: "none",
                            background: "white",
                            color: "var(--wds-label-strong)",
                            fontFamily: "inherit",
                            minWidth: 0,
                            width: "100%",
                          }}
                        />
                      ) : (
                        <span
                          className={`val ${r.isCorrect ? "correct" : "wrong"}`}
                          onClick={() =>
                            !isPending &&
                            startEditAnswer(r.questionNumber, r.studentAnswer ?? "")
                          }
                          style={{
                            cursor: onAnswerEdit && !isPending ? "pointer" : "default",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            color: isPending ? "var(--wds-label-neutral)" : undefined,
                          }}
                          title={
                            isPending
                              ? "채점 중..."
                              : onAnswerEdit
                                ? "클릭하여 답안 수정"
                                : undefined
                          }
                        >
                          {r.isEdited && !isPending && (
                            <Pencil size={10} style={{ color: "var(--g-warn)" }} />
                          )}
                          {isPending ? pending : r.studentAnswer || "— 미응답"}
                        </span>
                      )}
                      <span className="lbl">정답</span>
                      <span className="val">{r.correctAnswer}</span>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
