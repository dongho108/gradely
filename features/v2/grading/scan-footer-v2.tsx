"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ScanLine, Square, X } from "lucide-react";
import { useScanStore } from "@/store/use-scan-store";
import { useTabScan } from "@/features/scanner/hooks/use-tab-scan";
import { useScannerAvailability } from "@/features/scanner/hooks/use-scanner-availability";

interface ScanFooterV2Props {
  tabId: string;
}

export function ScanFooterV2({ tabId }: ScanFooterV2Props) {
  const { scanSettings, updateScanSettings } = useScanStore();
  const { isScanning, pageCount, lastError, startScan, stopScan } = useTabScan(tabId);
  const { devices } = useScannerAvailability();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const footRef = useRef<HTMLDivElement>(null);

  const isDevMode =
    process.env.NODE_ENV === "development" &&
    (typeof window === "undefined" || !window.electronAPI?.isElectron);
  const disabled = !isDevMode && devices.length === 0;

  // Reset the local dismiss flag whenever a new scan event arrives.
  useEffect(() => {
    setDismissed(false);
  }, [isScanning, pageCount, lastError]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (footRef.current && !footRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const start = (source: "duplex" | "feeder") => {
    setMenuOpen(false);
    updateScanSettings({ source });
    startScan({ scanOptions: { source } });
  };

  const showProgress = isScanning || (!dismissed && (pageCount > 0 || !!lastError));
  const mode = scanSettings.source === "duplex" ? "양면" : "단면";

  return (
    <div
      ref={footRef}
      className="g-students-foot"
      style={{ position: "relative" }}
    >
      {showProgress ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: "var(--wds-radius-md)",
            background: lastError
              ? "var(--g-wrong-bg, #FEECEC)"
              : isScanning
                ? "var(--wds-blue-95)"
                : "var(--g-correct-bg)",
            border: `1px solid ${
              lastError
                ? "var(--g-wrong, #DC2626)"
                : isScanning
                  ? "var(--wds-blue-90)"
                  : "var(--wds-green-90, #C8E9D2)"
            }`,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isScanning ? (
              <span className="g-dot g-dot-blue" />
            ) : lastError ? null : (
              <span
                className="g-modal-ring g-modal-ring-green"
                style={{ width: 22, height: 22 }}
              >
                <Check size={12} />
              </span>
            )}
            <div
              style={{
                flex: 1,
                fontSize: 12,
                fontWeight: 600,
                color: lastError ? "var(--g-wrong, #DC2626)" : "var(--wds-label-strong)",
              }}
            >
              {lastError
                ? lastError
                : isScanning
                  ? `스캔 중… ${pageCount}장`
                  : `스캔 완료 · ${pageCount}장`}
            </div>
            {!lastError && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--wds-label-alternative)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {mode}
              </div>
            )}
            {isScanning ? (
              <button
                type="button"
                onClick={stopScan}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  border: "none",
                  background: "transparent",
                  color: "var(--g-wrong, #DC2626)",
                  fontSize: 11,
                  cursor: "pointer",
                  padding: "2px 4px",
                }}
              >
                <Square size={11} />
                중단
              </button>
            ) : (
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setDismissed(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  background: "transparent",
                  color: "var(--wds-label-alternative)",
                  cursor: "pointer",
                  padding: 2,
                  borderRadius: "var(--wds-radius-xs)",
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="g-btn g-btn-md g-btn-primary g-btn-block"
          onClick={() => setMenuOpen((o) => !o)}
          disabled={disabled}
        >
          <ScanLine size={15} />
          답안지 스캔
          <ChevronDown size={11} />
        </button>
      )}

      {menuOpen && !showProgress && (
        <div
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: "calc(100% - 4px)",
            background: "var(--wds-bg-elevated)",
            borderRadius: "var(--wds-radius-md)",
            boxShadow: "var(--wds-shadow-lg)",
            border: "1px solid var(--wds-line-soft, var(--wds-cool-97))",
            padding: 6,
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--wds-label-alternative)",
              padding: "6px 10px 4px",
              letterSpacing: ".04em",
            }}
          >
            급지 방식 선택
          </div>
          <ScanModeButton
            icon={<ScanLine size={14} />}
            label="양면 스캔"
            sub="앞뒤 모두 스캔"
            onClick={() => start("duplex")}
          />
          <ScanModeButton
            icon={<ScanLine size={14} />}
            label="단면 스캔"
            sub="앞면만 스캔"
            onClick={() => start("feeder")}
          />
        </div>
      )}
    </div>
  );
}

function ScanModeButton({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        border: "none",
        background: "transparent",
        borderRadius: "var(--wds-radius-sm)",
        cursor: "pointer",
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--wds-cool-98)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {icon}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--wds-label-strong)",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--wds-label-alternative)",
          }}
        >
          {sub}
        </div>
      </div>
    </button>
  );
}
