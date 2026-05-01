"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, Trash2, UploadCloud } from "lucide-react";
import { useAuthStore } from "@/store/use-auth-store";
import { useTabStore } from "@/store/use-tab-store";
import { archiveSession } from "@/lib/persistence-service";
import { filesToImages } from "@/lib/file-utils";
import { extractAnswerStructureFromImages } from "@/lib/grading-service";
import { partitionFilesByAccepted } from "@/lib/submission-drop-utils";
import { NewExamScanButton } from "./new-exam-scan-button";

function formatDate(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

export function ExamRail() {
  const tabs = useTabStore((s) => s.tabs);
  const submissions = useTabStore((s) => s.submissions);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const removeTab = useTabStore((s) => s.removeTab);
  const addTabFromAnswerKey = useTabStore((s) => s.addTabFromAnswerKey);
  const userId = useAuthStore((s) => s.user?.id);

  const [query, setQuery] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [analyzingCount, setAnalyzingCount] = useState(0);
  const [notice, setNotice] = useState<{
    kind: "info" | "success" | "error";
    text: string;
  } | null>(null);
  const dragCounterRef = useRef(0);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback(
    (kind: "info" | "success" | "error", text: string, ttl = 4000) => {
      setNotice({ kind, text });
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(null), ttl);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const visibleTabs = useMemo(
    () => tabs.filter((t) => t.title.trim().toLowerCase() !== "new exam"),
    [tabs],
  );

  const filteredTabs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? visibleTabs.filter((t) => t.title.toLowerCase().includes(q))
      : visibleTabs;
    return [...base].sort((a, b) => b.createdAt - a.createdAt);
  }, [visibleTabs, query]);

  const handleDelete = (e: React.MouseEvent, tabId: string, title: string) => {
    e.stopPropagation();
    if (
      !confirm(
        `"${title}" 시험을 삭제할까요?\n\n포함된 정답지·답안지·채점 결과가 함께 삭제됩니다.`,
      )
    ) {
      return;
    }
    if (userId) {
      archiveSession(tabId)
        .catch((err) => console.error("[ExamRail] archive failed:", err))
        .finally(() => removeTab(tabId));
    } else {
      removeTab(tabId);
    }
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

  const processOneAnswerKey = async (file: File, fallbackIndex: number) => {
    const images = await filesToImages([file]);
    const structure = await extractAnswerStructureFromImages(images);
    addTabFromAnswerKey({
      title: structure.title || `정답지 ${fallbackIndex + 1}`,
      files: [file],
      structure,
    });
  };

  const handleDrop = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragActive(false);

    const dropped = e.dataTransfer?.files
      ? Array.from(e.dataTransfer.files)
      : [];
    if (dropped.length === 0) return;

    const { accepted, rejected } = partitionFilesByAccepted(dropped);
    if (accepted.length === 0) {
      showNotice(
        "error",
        "PDF 또는 이미지(JPG/PNG)만 정답지로 등록할 수 있습니다.",
      );
      return;
    }

    setAnalyzingCount((c) => c + accepted.length);
    let success = 0;
    let firstError: string | null = null;
    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i];
      try {
        await processOneAnswerKey(file, i);
        success += 1;
      } catch (err) {
        if (!firstError) {
          firstError = err instanceof Error ? err.message : String(err);
        }
        console.error("[ExamRail] answer key extraction failed:", err);
      } finally {
        setAnalyzingCount((c) => Math.max(0, c - 1));
      }
    }

    if (firstError && success === 0) {
      showNotice("error", `정답지 분석 실패: ${firstError}`);
    } else if (firstError) {
      showNotice(
        "error",
        `${success}개 시험 추가 · ${accepted.length - success}개 분석 실패 (${firstError})`,
      );
    } else if (rejected.length > 0) {
      showNotice(
        "success",
        `${success}개 시험 추가 · ${rejected.length}개 제외(지원하지 않는 형식).`,
      );
    } else {
      showNotice("success", `${success}개 시험 추가 완료.`);
    }
  };

  const noticeStyle = (kind: "info" | "success" | "error") => {
    if (kind === "error") {
      return {
        background: "var(--g-wrong-bg, #FEECEC)",
        color: "var(--g-wrong, #DC2626)",
        border: "1px solid var(--g-wrong, #DC2626)",
      };
    }
    if (kind === "success") {
      return {
        background: "var(--g-correct-bg, #ECFDF3)",
        color: "var(--wds-label-strong)",
        border: "1px solid var(--wds-green-90, #C8E9D2)",
      };
    }
    return {
      background: "var(--wds-blue-95)",
      color: "var(--wds-label-strong)",
      border: "1px solid var(--wds-blue-90)",
    };
  };

  return (
    <aside
      className={`g-rail${isDragActive ? " is-drag-active" : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ position: "relative" }}
    >
      <div className="g-rail-head">
        <div className="g-rail-title">시험 목록</div>
        <div className="g-rail-search">
          <Search size={14} />
          <input
            placeholder="검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {(notice || analyzingCount > 0) && (
        <div
          role="status"
          aria-live="polite"
          style={{
            margin: "0 var(--wds-sp-12) 6px",
            padding: "8px 10px",
            borderRadius: "var(--wds-radius-md)",
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
            ...(analyzingCount > 0
              ? noticeStyle("info")
              : noticeStyle(notice!.kind)),
          }}
        >
          {analyzingCount > 0 ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>정답지 분석 중… {analyzingCount}개 남음</span>
            </>
          ) : (
            <span>{notice!.text}</span>
          )}
        </div>
      )}

      <div className="g-rail-list">
        {filteredTabs.length === 0 ? (
          <div
            className="wds-caption1"
            style={{
              color: "var(--wds-label-assistive)",
              padding: "var(--wds-sp-12)",
              textAlign: "center",
            }}
          >
            {visibleTabs.length === 0
              ? "아직 시험이 없어요. PDF를 드래그앤드랍하면 정답지로 등록됩니다."
              : "검색 결과가 없어요"}
          </div>
        ) : (
          filteredTabs.map((tab) => {
            const tabSubs = submissions[tab.id] || [];
            const isActive = activeTabId === tab.id;
            return (
              <div
                key={tab.id}
                className={`g-rail-item ${isActive ? "is-active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <button
                  type="button"
                  className="g-rail-item-del"
                  title="시험 삭제"
                  onClick={(e) => handleDelete(e, tab.id, tab.title)}
                >
                  <Trash2 size={11} />
                </button>
                <div className="g-rail-item-title">{tab.title || "제목 없음"}</div>
                <div className="g-rail-item-meta">
                  <span>{formatDate(tab.createdAt)}</span>
                  <span>·</span>
                  <span>{tabSubs.length}명</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="g-rail-foot">
        <NewExamScanButton />
      </div>

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
            여기에 정답지 파일을 놓으세요
          </div>
          <div style={{ fontSize: 11, color: "var(--wds-label-alternative)" }}>
            PDF · JPG · PNG · 1 파일 = 1 시험
          </div>
        </div>
      )}
    </aside>
  );
}
