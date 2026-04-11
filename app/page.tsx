"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { UploadAnswerKey } from "@/features/grader/components/upload-answer-key";
import { GradingWorkspace } from "@/features/grader/components/grading-workspace";
import { AnswerKeyScanPanel } from "@/features/scanner/components/answer-key-scan-panel";
import { useTabStore, StoreExamSession } from "@/store/use-tab-store";
import { useScannerStore } from "@/store/use-scanner-store";
import { useInitialData } from "@/hooks/use-initial-data";
import { useAuthInit } from "@/hooks/use-auth-init";
import { useSessionSync } from "@/hooks/use-session-sync";
import { resolveFile, evictFile } from "@/lib/file-resolver";
import { Loader2 } from "lucide-react";

/**
 * Resolves the answer key File for a tab.
 * If fileRef exists, use it directly. Otherwise, lazy-download from storagePath.
 */
function useAnswerKeyFile(activeTab: StoreExamSession | undefined) {
  const [file, setFile] = useState<File | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!activeTab || activeTab.status !== 'ready') {
      setFile(undefined);
      setError(null);
      return;
    }

    const akf = activeTab.answerKeyFile;
    if (!akf) {
      setFile(undefined);
      setError(null);
      return;
    }

    // If we have a local file reference, use it
    if (akf.fileRef) {
      setFile(akf.fileRef);
      setError(null);
      return;
    }

    // If we have a storage path, download it
    if (akf.storagePath) {
      setFile(undefined);
      setIsLoading(true);
      setError(null);
      resolveFile(akf.storagePath, akf.name)
        .then((resolved) => {
          setFile(resolved);
          // Also update the store so we don't re-download
          const state = useTabStore.getState();
          useTabStore.setState({
            tabs: state.tabs.map((t) =>
              t.id === activeTab.id && t.answerKeyFile
                ? { ...t, answerKeyFile: { ...t.answerKeyFile, fileRef: resolved } }
                : t
            ),
          });
        })
        .catch((err) => {
          console.error('[AnswerKeyResolve] Failed:', err);
          setError('파일을 불러올 수 없습니다. 다시 시도해주세요.');
        })
        .finally(() => setIsLoading(false));
    }
  }, [activeTab?.id, activeTab?.status, activeTab?.answerKeyFile?.storagePath, activeTab?.answerKeyFile?.fileRef, retryKey]);

  const retry = () => {
    evictFile(activeTab?.answerKeyFile?.storagePath ?? '');
    setRetryKey((k) => k + 1);
  };

  return { file, isLoading, error, retry };
}

// 앱 시작 시 스캐너 가용성 조기 초기화 (버튼 지연 방지)
if (typeof window !== 'undefined') {
  useScannerStore.getState().initialize();
}

export default function Home() {
  useInitialData();
  useAuthInit();
  useSessionSync();

  const { activeTabId, tabs } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const { file: answerKeyFile, isLoading: isResolvingFile, error: resolveError, retry: retryResolve } = useAnswerKeyFile(activeTab);
  const [showAnswerKeyScan, setShowAnswerKeyScan] = useState(false);

  return (
    <div className="flex flex-col h-screen w-full bg-gray-50 overflow-hidden">
      <Header />

      <main className="flex-1 overflow-hidden relative p-4">
        {showAnswerKeyScan ? (
          <AnswerKeyScanPanel onClose={() => setShowAnswerKeyScan(false)} />
        ) : activeTab ? (
           activeTab.status === 'idle' || activeTab.status === 'extracting' ? (
             <UploadAnswerKey onStartScan={() => setShowAnswerKeyScan(true)} />
           ) : activeTab.status === 'ready' && answerKeyFile ? (
             <GradingWorkspace
               key={activeTab.id}
               tabId={activeTab.id}
               answerKeyFile={answerKeyFile}
             />
           ) : isResolvingFile ? (
             <div className="flex flex-col h-full items-center justify-center text-gray-400 gap-2">
               <Loader2 className="w-8 h-8 animate-spin text-primary" />
               <span>파일 불러오는 중...</span>
             </div>
           ) : resolveError ? (
             <div className="flex flex-col h-full items-center justify-center text-gray-500 gap-3">
               <p>{resolveError}</p>
               <button
                 onClick={retryResolve}
                 className="px-4 py-2 text-sm bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
               >
                 다시 시도
               </button>
             </div>
           ) : (
             <div className="flex h-full items-center justify-center text-gray-400">
               Loading...
             </div>
           )
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            No active tab
          </div>
        )}
      </main>
    </div>
  );
}
