"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine, Keyboard, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "./Input";
import { Button } from "./Button";

interface QRScannerProps {
  /** Called with the raw decoded string (or manually typed code). */
  onResult: (value: string) => void;
  /** Placeholder for the manual-entry field, e.g. "SCH-7F82K91" */
  manualPlaceholder?: string;
}

export function QRScanner({ onResult, manualPlaceholder = "Enter code" }: QRScannerProps) {
  const [tab, setTab] = useState<"scan" | "manual">("scan");
  const [manualValue, setManualValue] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const containerId = useRef(`qr-region-${Math.random().toString(36).slice(2)}`);
  const scannerRef = useRef<any>(null);

  useEffect(() => {
    if (tab !== "scan") return;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;

        const scanner = new Html5Qrcode(containerId.current);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            onResult(decodedText);
            scanner.stop().catch(() => {});
          },
          () => {
            /* per-frame decode miss — expected, ignore */
          }
        );
      } catch (err) {
        setCameraError("Camera access is unavailable. Enter the code manually instead.");
        setTab("manual");
      }
    })();

    return () => {
      cancelled = true;
      scannerRef.current?.stop?.().catch(() => {});
    };
  }, [tab, onResult]);

  return (
    <div className="flex flex-col items-center">
      <div className="mb-5 flex gap-2 rounded-full glass-surface p-1">
        <button
          onClick={() => setTab("scan")}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
            tab === "scan" ? "bg-white/12 text-ink" : "text-ink-muted"
          )}
        >
          <ScanLine className="h-4 w-4" /> Scan QR
        </button>
        <button
          onClick={() => setTab("manual")}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
            tab === "manual" ? "bg-white/12 text-ink" : "text-ink-muted"
          )}
        >
          <Keyboard className="h-4 w-4" /> Enter Code
        </button>
      </div>

      {tab === "scan" ? (
        <div className="flex flex-col items-center gap-3">
          <div
            id={containerId.current}
            className="h-64 w-64 overflow-hidden rounded-3xl glass-surface [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
          />
          {cameraError && (
            <div className="flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex w-full flex-col gap-4">
          <Input
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value.toUpperCase())}
            placeholder={manualPlaceholder}
            className="text-center tracking-widest"
            autoCapitalize="characters"
          />
          <Button onClick={() => onResult(manualValue)} disabled={manualValue.trim().length < 4}>
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}
