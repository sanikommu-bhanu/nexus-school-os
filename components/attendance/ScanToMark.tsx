"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine, Nfc, Keyboard, Check, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useNfcReader } from "@/hooks/useNfcReader";
import {
  applyScan,
  summarizeSession,
  type ScannableStudent,
  type ScanOutcome,
} from "@/lib/attendance-capture";

type Mode = "camera" | "nfc" | "manual";

/**
 * Automated attendance capture: students tap an NFC/RFID card or show
 * an ID card to the camera, and the register fills itself in.
 *
 * All three inputs converge on one `handleToken`, because the decision
 * logic lives in lib/attendance-capture.ts and does not care which
 * sensor produced the string. That is what keeps this a single
 * attendance pipeline rather than a parallel one — the teacher's
 * manual register and a scanned register write the identical records.
 *
 * The camera path scans CONTINUOUSLY (unlike components/ui/QRScanner,
 * which stops on the first result) because a class scans in one after
 * another.
 */
export function ScanToMark({
  roster,
  onMarkPresent,
  onClose,
}: {
  roster: ScannableStudent[];
  /** Called once per newly-identified student. */
  onMarkPresent: (studentId: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("camera");
  const [scanned, setScanned] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<ScanOutcome | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState("");

  const containerId = useRef(`scan-region-${Math.random().toString(36).slice(2)}`);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  // Latest values for the scanner callback, which is registered once.
  const scannedRef = useRef(scanned);
  scannedRef.current = scanned;
  const rosterRef = useRef(roster);
  rosterRef.current = roster;

  const handleToken = (token: string) => {
    const outcome = applyScan(token, rosterRef.current, scannedRef.current);
    setFeedback(outcome);
    if (outcome.kind === "marked") {
      setScanned((prev) => new Set(prev).add(outcome.student.id));
      onMarkPresent(outcome.student.id);
    }
  };
  const handleTokenRef = useRef(handleToken);
  handleTokenRef.current = handleToken;

  const nfc = useNfcReader((token) => handleTokenRef.current(token));
  // `useNfcReader` returns a fresh object each render, so the effects
  // below depend on these individually-stable pieces instead. Depending
  // on `nfc` itself would restart the NFC scan on every single render.
  const { start: startNfc, stop: stopNfc, supported: nfcSupported } = nfc;
  const nfcSupportedRef = useRef(nfcSupported);
  nfcSupportedRef.current = nfcSupported;

  // ---- camera (continuous) ----
  useEffect(() => {
    if (mode !== "camera") return;
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode(containerId.current);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded: string) => handleTokenRef.current(decoded),
          () => {
            /* per-frame decode miss — expected */
          }
        );
      } catch {
        if (!cancelled) {
          setCameraError("Camera unavailable. Use a card tap or enter a roll number.");
          setMode(nfcSupportedRef.current ? "nfc" : "manual");
        }
      }
    })();

    return () => {
      cancelled = true;
      scannerRef.current?.stop?.().catch(() => {});
      scannerRef.current = null;
    };
  }, [mode]);

  // ---- nfc ----
  useEffect(() => {
    if (mode !== "nfc") return;
    void startNfc();
    return () => stopNfc();
  }, [mode, startNfc, stopNfc]);

  // Feedback is transient so consecutive taps stay readable.
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 2200);
    return () => clearTimeout(t);
  }, [feedback]);

  const session = summarizeSession(roster, scanned);

  const MODES: { id: Mode; label: string; icon: typeof ScanLine; available: boolean }[] = [
    { id: "camera", label: "Camera", icon: ScanLine, available: true },
    { id: "nfc", label: "Card tap", icon: Nfc, available: nfcSupported },
    { id: "manual", label: "Type", icon: Keyboard, available: true },
  ];

  return (
    <div className="glass-surface flex flex-col gap-4 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Scan students in</p>
          <p className="text-xs text-ink-muted">
            {session.scanned} of {session.total} marked present
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close scanner"
          className="tap-target flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/8"
        >
          <X className="h-4 w-4 text-ink-muted" />
        </button>
      </div>

      {/* progress */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-success transition-[width] duration-300"
          style={{ width: `${session.total ? (session.scanned / session.total) * 100 : 0}%` }}
        />
      </div>

      <div className="flex gap-1 rounded-full bg-white/6 p-1">
        {MODES.filter((m) => m.available).map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors",
                mode === m.id ? "bg-white/12 text-ink" : "text-ink-muted"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {m.label}
            </button>
          );
        })}
      </div>

      {mode === "camera" && (
        <div
          id={containerId.current}
          className="h-56 w-full overflow-hidden rounded-2xl bg-black/30 [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
        />
      )}

      {mode === "nfc" && (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 py-8 text-center">
          <Nfc
            className={cn("h-8 w-8", nfc.status === "scanning" ? "animate-pulse text-accent-soft" : "text-ink-faint")}
          />
          <p className="text-sm text-ink">
            {nfc.status === "scanning" ? "Hold a card to the phone" : "Starting NFC…"}
          </p>
          {nfc.error && <p className="max-w-[240px] text-xs text-warning">{nfc.error}</p>}
        </div>
      )}

      {mode === "manual" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!manualValue.trim()) return;
            handleToken(manualValue);
            setManualValue("");
          }}
          className="flex flex-col gap-2"
        >
          <Input
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            placeholder="Roll number or student ID"
            autoFocus
          />
          <Button type="submit" variant="ghost" disabled={!manualValue.trim()}>
            Mark present
          </Button>
        </form>
      )}

      {cameraError && mode !== "camera" && (
        <p className="text-xs text-warning">{cameraError}</p>
      )}

      {/* transient per-scan feedback */}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "flex items-center gap-2 rounded-xl p-3 text-xs font-medium",
            feedback.kind === "marked" && "bg-success/12 text-success",
            feedback.kind === "duplicate" && "bg-white/8 text-ink-muted",
            feedback.kind === "unknown" && "bg-danger/12 text-danger"
          )}
        >
          {feedback.kind === "unknown" ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <Check className="h-4 w-4 shrink-0" />
          )}
          <span>
            {feedback.kind === "marked" && `${feedback.student.name ?? "Student"} marked present`}
            {feedback.kind === "duplicate" && `${feedback.student.name ?? "Student"} already scanned`}
            {feedback.kind === "unknown" && `Card not recognised (${feedback.token || "empty"})`}
          </span>
        </div>
      )}

      {session.missing.length > 0 && session.scanned > 0 && (
        <p className="text-xs text-ink-faint">
          Still to scan: {session.missing.map((m) => m.name ?? m.id).join(", ")}
        </p>
      )}
    </div>
  );
}
