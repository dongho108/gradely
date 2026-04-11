"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
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
 * Resolves the answer key Files for a tab.
 * If fileRefs exist, use them directly. Otherwise, lazy-download from storagePath.
 */
function useAnswerKeyFiles(activeTab: StoreExamSession | undefined) {
  const [files, setFiles] = useState<File[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!activeTab || activeTab.status !== 'ready') {
      setFiles(undefined);
      setError(null);
      return;
    }

    const akf = activeTab.answerKeyFile;
    if (!akf) {
      setFiles(undefined);
      setError(null);
      return;
    }

    // If we have local file references, use them
    if (akf.fileRefs && akf.fileRefs.length > 0) {
      setFiles(akf.fileRefs);
      setError(null);
      return;
    }

    // If we have a storage path, download it
    if (akf.storagePath) {
      setFiles(undefined);
      setIsLoading(true);
      setError(null);
      resolveFile(akf.storagePath, akf.name)
        .then((resolved) => {
          setFiles([resolved]);
          // Also update the store so we don't re-download
          const state = useTabStore.getState();
          useTabStore.setState({
            tabs: state.tabs.map((t) =>
              t.id === activeTab.id && t.answerKeyFile
                ? { ...t, answerKeyFile: { ...t.answerKeyFile, fileRefs: [resolved] } }
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
  }, [activeTab?.id, activeTab?.status, activeTab?.answerKeyFile?.storagePath, activeTab?.answerKeyFile?.fileRefs, retryKey]);

  const retry = () => {
    evictFile(activeTab?.answerKeyFile?.storagePath ?? '');
    setRetryKey((k) => k + 1);
  };

  return { files, isLoading, error, retry };
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
  const { files: answerKeyFiles, isLoading: isResolvingFile, error: resolveError, retry: retryResolve } = useAnswerKeyFiles(activeTab);
  return (
    <div className="flex flex-col h-screen w-full bg-gray-50 overflow-hidden">
      <Header />

      <main className="flex-1 overflow-hidden relative p-4">
        {activeTab ? (
           activeTab.status === 'idle' || activeTab.status === 'extracting' ? (
             <AnswerKeyScanPanel />
           ) : activeTab.status === 'ready' && answerKeyFiles ? (
             <GradingWorkspace
               key={activeTab.id}
               tabId={activeTab.id}
               answerKeyFiles={answerKeyFiles}
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
