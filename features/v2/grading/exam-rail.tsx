"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { useAuthStore } from "@/store/use-auth-store";
import { useTabStore } from "@/store/use-tab-store";
import { archiveSession } from "@/lib/persistence-service";

function formatDate(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

interface ExamRailProps {
  onNewExamClick: () => void;
}

export function ExamRail({ onNewExamClick }: ExamRailProps) {
  const tabs = useTabStore((s) => s.tabs);
  const submissions = useTabStore((s) => s.submissions);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const removeTab = useTabStore((s) => s.removeTab);
  const userId = useAuthStore((s) => s.user?.id);

  const [query, setQuery] = useState("");

  const visibleTabs = useMemo(
    () => tabs.filter((t) => t.title.trim().toLowerCase() !== "new exam"),
    [tabs],
  );

  const filteredTabs = useMemo(() => {
    if (!query.trim()) return visibleTabs;
    const q = query.trim().toLowerCase();
    return visibleTabs.filter((t) => t.title.toLowerCase().includes(q));
  }, [visibleTabs, query]);

  const handleDelete = (e: React.MouseEvent, tabId: string, title: string) => {
    e.stopPropagation();
    if (!confirm(`"${title}" 시험을 삭제할까요?\n\n포함된 정답지·답안지·채점 결과가 함께 삭제됩니다.`)) {
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

  return (
    <aside className="g-rail">
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
            {visibleTabs.length === 0 ? "아직 시험이 없어요" : "검색 결과가 없어요"}
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
        <button
          type="button"
          className="g-btn g-btn-md g-btn-outline g-btn-block"
          onClick={onNewExamClick}
        >
          <Plus size={15} />새 시험
        </button>
      </div>
    </aside>
  );
}
