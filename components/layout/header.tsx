"use client";

import { useTabStore } from "@/store/use-tab-store";
import { cn } from "@/lib/utils";
import { Plus, X, LogOut, Download, RefreshCw, RotateCw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useRef, useCallback } from "react";
import { isElectron } from "@/lib/is-electron";
import { useAuthStore } from "@/store/use-auth-store";
import { GoogleLoginButton } from "@/components/auth/google-login-button";
import { ScannerStatusIndicator } from "@/features/scanner/components/scanner-status-indicator";
import { archiveSession } from "@/lib/persistence-service";
import { SessionHistoryModal } from "./session-history-modal";

export function Header() {
  const { tabs, activeTabId, addTab, setActiveTab, removeTab, updateTabTitle } = useTabStore();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signOut = useAuthStore((s) => s.signOut);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'available' | 'downloading' | 'ready'>('idle');
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize with one tab if empty on mount (Client-side only)
  useEffect(() => {
    if (tabs.length === 0) {
      addTab();
    }
  }, [tabs.length, addTab]);

  // Desktop: 앱 버전 조회
  useEffect(() => {
    if (isElectron() && window.electronAPI?.appVersion) {
      window.electronAPI.appVersion().then((v: string) => setAppVersion(v));
    }
  }, []);

  // Desktop: electron-updater 이벤트 수신
  useEffect(() => {
    if (!isElectron() || !window.electronAPI?.updater) return;

    const cleanups = [
      window.electronAPI.updater.onUpdateAvailable(() => {
        setUpdateStatus('available');
      }),
      window.electronAPI.updater.onUpdateProgress(() => {
        setUpdateStatus('downloading');
      }),
      window.electronAPI.updater.onUpdateDownloaded(() => {
        setUpdateStatus('ready');
      }),
    ];

    return () => { cleanups.forEach((fn) => fn()); };
  }, []);

  // Web: GitHub API로 다운로드 URL 확인
  useEffect(() => {
    if (isElectron()) return;
    fetch("https://api.github.com/repos/dongho108/ai-exam-grader/releases/latest")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.assets) return;
        const exe = data.assets.find((a: { name: string }) => a.name.endsWith(".exe"));
        if (exe) setDownloadUrl(exe.browser_download_url);
      })
      .catch(() => {});
  }, []);

  const handleUpdate = useCallback(() => {
    if (updateStatus === 'available') {
      window.electronAPI?.updater?.downloadUpdate();
    } else if (updateStatus === 'ready') {
      window.electronAPI?.updater?.installUpdate();
    }
  }, [updateStatus]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const handleStartEdit = (tabId: string, currentTitle: string) => {
    if (activeTabId === tabId) {
      setEditingTabId(tabId);
      setEditValue(currentTitle);
    }
  };

  const handleSaveEdit = () => {
    if (editingTabId) {
      const trimmedValue = editValue.trim();
      if (trimmedValue) {
        updateTabTitle(editingTabId, trimmedValue);
      }
      setEditingTabId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
    }
  };

  return (
    <>
    <header className="flex h-12 items-center border-b border-gray-200 bg-white px-2 shadow-sm shrink-0">
      {/* Brand Icon or Logo Area */}
      <div className="mr-4 flex items-center gap-3 px-2 text-primary font-bold shrink-0">
        <img src="/logo.png" alt="AI 채점기 로고" className="h-8 w-auto object-contain" />
      </div>

      {/* Tabs Container */}
      <div className="flex flex-1 items-end gap-1 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={() => handleStartEdit(tab.id, tab.title)}
            className={cn(
              "group relative flex md:w-48 max-w-[200px] min-w-[120px] cursor-pointer items-center justify-between rounded-t-lg border-t border-x px-3 py-2 text-sm font-medium transition-all select-none",
              activeTabId === tab.id
                ? "border-gray-300 bg-[#ECFEFF] text-primary shadow-[0_-2px_5px_rgba(0,0,0,0.02)] z-10"
                : "border-transparent bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 mt-1 h-9"
            )}
          >
            <div className="flex-1 truncate mr-2 flex items-center gap-1.5 overflow-hidden">
              {tab.status === 'extracting' && (
                <Plus className="h-3 w-3 animate-spin text-primary shrink-0" />
              )}
              {editingTabId === tab.id ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={handleSaveEdit}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full bg-transparent border-none outline-none focus:ring-0 p-0 font-medium text-primary select-text"
                />
              ) : (
                <span 
                  className="truncate"
                  onClick={(e) => {
                    if (activeTabId === tab.id) {
                      e.stopPropagation();
                      handleStartEdit(tab.id, tab.title);
                    }
                  }}
                >
                  {tab.status === 'extracting' ? '분석 중...' : tab.title}
                </span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const userId = useAuthStore.getState().user?.id;
                if (userId) {
                  // Archive first, then remove tab on success
                  archiveSession(tab.id)
                    .then(() => removeTab(tab.id))
                    .catch((err) =>
                      console.error('[Header] Failed to archive session:', err)
                    );
                } else {
                  // Not authenticated — just remove from UI
                  removeTab(tab.id);
                }
              }}
              className={cn(
                "rounded-full p-0.5 opacity-0 transition-opacity hover:bg-red-100 hover:text-red-500 shrink-0",
                activeTabId === tab.id && "opacity-100",
                "group-hover:opacity-100"
              )}
            >
              <X className="h-3 w-3" />
            </button>
            
            {/* Active Indicator Line */}
            {activeTabId === tab.id && (
              <div className="absolute top-0 left-0 h-[2px] w-full bg-primary rounded-t-full" />
            )}
          </div>
        ))}

        {/* New Tab Button */}
        {isAuthenticated && (
          <button
            onClick={addTab}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-primary transition-colors mb-1 shrink-0"
            aria-label="새 시험"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
        {isAuthenticated && (
          <button
            onClick={() => setShowHistory(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-primary transition-colors mb-1 shrink-0"
            aria-label="세션 히스토리"
          >
            <History className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Right Side Actions */}
      <div className="ml-4 flex items-center gap-3 shrink-0">
        <ScannerStatusIndicator />
        {/* Desktop: electron-updater 기반 업데이트 */}
        {isElectron() && updateStatus === 'available' && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleUpdate}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">업데이트</span>
          </Button>
        )}
        {isElectron() && updateStatus === 'downloading' && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled
          >
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            <span className="hidden sm:inline">다운로드 중...</span>
          </Button>
        )}
        {isElectron() && updateStatus === 'ready' && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleUpdate}
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">재시작</span>
          </Button>
        )}
        {/* Web: GitHub releases 다운로드 링크 */}
        {!isElectron() && downloadUrl && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => window.open(downloadUrl, "_blank")}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">다운로드</span>
          </Button>
        )}
        {!isAuthenticated ? (
          <GoogleLoginButton 
            onClick={signInWithGoogle} 
            label="로그인"
            className="h-8 py-0 px-2 min-h-[32px]" 
          />
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {user?.user_metadata?.avatar_url && (
                <img
                  src={user.user_metadata.avatar_url}
                  alt={user.user_metadata.full_name || '프로필'}
                  className="h-8 w-8 rounded-full border-2 border-gray-200"
                />
              )}
              <span className="hidden sm:inline text-sm font-medium text-gray-700">
                {user?.user_metadata?.full_name || user?.email}
              </span>
            </div>
            <button
              onClick={signOut}
              className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-red-500 transition-colors"
              aria-label="로그아웃"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
        {appVersion && (
          <span className="text-[10px] text-gray-400 select-none">v{appVersion}</span>
        )}
      </div>
    </header>
    {showHistory && <SessionHistoryModal onClose={() => setShowHistory(false)} />}
    </>
  );
}
