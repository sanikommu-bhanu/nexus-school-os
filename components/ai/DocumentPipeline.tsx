"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion, type Transition } from "framer-motion";
import { UploadCloud, FileText, ScanText, BrainCircuit, Database, Check, AlertTriangle, X, Sparkles } from "lucide-react";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { Button } from "@/components/ui/Button";
import {
  uploadAndProcessDocument,
  updateDocumentReview,
  validateUploadFile,
  DocumentValidationError,
  type PipelineStepEvent,
  type PipelineStepName,
  type PipelineStepStatus,
} from "@/services/document-service";
import type { DocumentMeta, DocumentType } from "@/types";
import { cn } from "@/lib/utils";

const STEP_ORDER: { key: PipelineStepName; label: string; icon: typeof UploadCloud }[] = [
  { key: "uploading", label: "Uploading", icon: UploadCloud },
  { key: "reading", label: "Reading", icon: ScanText },
  { key: "understanding", label: "Understanding", icon: BrainCircuit },
  { key: "indexing", label: "Indexing", icon: Database },
];

interface DocumentPipelineProps {
  schoolId: string;
  uploadedBy: string;
  documentType: DocumentType;
  classId?: string;
  ownerId: string;
  onComplete?: (doc: DocumentMeta) => void;
  /** Shown while idle, before a file is picked. */
  helperText?: string;
}

type PipelineState = "idle" | "running" | "ready" | "failed";

export function DocumentPipeline({ schoolId, uploadedBy, documentType, classId, ownerId, onComplete, helperText }: DocumentPipelineProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<PipelineState>("idle");
  const [steps, setSteps] = useState<Record<PipelineStepName, { status: PipelineStepStatus; detail?: string }>>({
    uploading: { status: "active" },
    reading: { status: "active" },
    understanding: { status: "active" },
    indexing: { status: "active" },
  });
  const [doc, setDoc] = useState<DocumentMeta | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [fieldsDraft, setFieldsDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);

  const reset = () => {
    setState("idle");
    setDoc(null);
    setSummaryDraft("");
    setFieldsDraft({});
    setSaved(false);
    setFailedMessage(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    // Validate before showing any pipeline UI at all — an instantly
    // rejected file (wrong type / too large) shouldn't flash a fake
    // "Uploading…" step first (Part 15/34/36: friendly, immediate
    // errors; no dead-looking or misleading progress states).
    try {
      validateUploadFile(file);
    } catch (err) {
      setFailedMessage(err instanceof DocumentValidationError ? err.message : "That file couldn't be uploaded.");
      setState("failed");
      return;
    }

    setState("running");
    setSteps({
      uploading: { status: "active" },
      reading: { status: "active" },
      understanding: { status: "active" },
      indexing: { status: "active" },
    });

    const onStep = (e: PipelineStepEvent) => {
      setSteps((prev) => ({ ...prev, [e.step]: { status: e.status, detail: e.detail } }));
    };

    try {
      const { document } = await uploadAndProcessDocument(schoolId, uploadedBy, file, { documentType, classId, ownerId }, onStep);
      setDoc(document);
      setSummaryDraft(document.aiSummary ?? "");
      setFieldsDraft(document.extractedFields ?? {});
      setState("ready");
    } catch (err) {
      setFailedMessage(err instanceof DocumentValidationError ? err.message : "Something went wrong uploading this file. Please try again.");
      setState("failed");
    }
  };

  const handleSaveReview = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      await updateDocumentReview(schoolId, doc.id, { aiSummary: summaryDraft, extractedFields: fieldsDraft });
      const updated: DocumentMeta = { ...doc, aiSummary: summaryDraft, extractedFields: fieldsDraft };
      setDoc(updated);
      setSaved(true);
      onComplete?.(updated);
    } finally {
      setSaving(false);
    }
  };

  // Typed as framer-motion's own Transition (rather than relying on
  // `as const` to fix the ease-tuple's inferred type) so this matches
  // the contextual typing every other transition={{ ease: [...] }}
  // literal in this codebase already gets for free.
  const transition: Transition = reduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] };

  if (state === "idle") {
    return (
      <div>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="application/pdf,image/*,text/plain"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="glass-surface flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-white/15 py-8 text-center active:scale-[0.99] transition-transform"
        >
          <UploadCloud className="h-6 w-6 text-accent-soft" />
          <p className="text-sm font-medium text-ink">Drag &amp; drop file here</p>
          <p className="text-xs text-ink-faint">or</p>
          <span className="rounded-full bg-white/8 px-4 py-1.5 text-xs font-semibold text-ink">Browse File</span>
          <p className="mt-1 text-[11px] text-ink-faint">{helperText ?? "Supported formats: PDF, PNG, JPG, TXT — Max size: 10MB"}</p>
        </button>
      </div>
    );
  }

  if (state === "failed") {
    return (
      <GlassSurface rounded="2xl">
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <AlertTriangle className="h-5 w-5 text-danger" />
          <p className="text-sm text-ink-muted">Something went wrong uploading this file.</p>
          <button onClick={reset} className="text-sm font-semibold text-accent-soft">
            Try again
          </button>
        </div>
      </GlassSurface>
    );
  }

  if (state === "running" || state === "ready") {
    const allDone = state === "ready";
    return (
      <GlassSurface rounded="2xl">
        {!allDone ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold text-ink">Processing document…</p>
            <div className="flex flex-col gap-3">
              {STEP_ORDER.map(({ key, label, icon: Icon }) => {
                const s = steps[key];
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors",
                        s.status === "done" && "bg-success/15 text-success",
                        s.status === "active" && "bg-accent/15 text-accent-soft",
                        s.status === "skipped" && "bg-white/6 text-ink-faint",
                        s.status === "error" && "bg-danger/15 text-danger"
                      )}
                    >
                      {s.status === "done" ? (
                        <Check className="h-4 w-4" />
                      ) : s.status === "error" ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : s.status === "active" ? (
                        <motion.span animate={reduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}>
                          <Icon className="h-4 w-4" />
                        </motion.span>
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", s.status === "skipped" ? "text-ink-faint" : "text-ink")}>{label}</p>
                      {s.detail && <p className="truncate text-xs text-ink-faint">{s.detail}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key="ready" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={transition} className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/15">
                  <FileText className="h-4.5 w-4.5 text-success" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{doc?.fileName}</p>
                  <p className="text-xs text-ink-faint">Document Ready</p>
                </div>
                <button onClick={reset} aria-label="Start over">
                  <X className="h-4 w-4 text-ink-faint" />
                </button>
              </div>

              {doc?.aiStatus === "unavailable" || doc?.aiStatus === "error" ? (
                <div className="flex items-start gap-2 rounded-xl bg-white/6 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <p className="text-xs text-ink-muted">
                    {doc?.aiStatus === "unavailable"
                      ? "The file is safely stored. AI reading isn't configured for this school, so no summary or fields were extracted."
                      : "The file is safely stored, but NEXUS AI couldn't extract a summary from it. You can add one manually below."}
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-xl bg-accent/10 p-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-soft" />
                  <p className="text-xs text-ink-muted">Review what NEXUS AI understood before it's saved — edit anything that's off.</p>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Summary</p>
                <textarea
                  value={summaryDraft}
                  onChange={(e) => setSummaryDraft(e.target.value)}
                  placeholder="Add a short summary…"
                  className="input-glass min-h-[70px] resize-none text-sm"
                />
              </div>

              {Object.keys(fieldsDraft).length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Extracted Fields</p>
                  <div className="flex flex-col gap-2">
                    {Object.entries(fieldsDraft).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="w-28 shrink-0 truncate text-xs capitalize text-ink-faint">{key.replace(/([A-Z])/g, " $1")}</span>
                        <input
                          value={value}
                          onChange={(e) => setFieldsDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="input-glass !py-2 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {saved ? (
                <div className="flex items-center gap-2 py-1 text-sm text-success">
                  <Check className="h-4 w-4" /> Saved.
                </div>
              ) : (
                <Button onClick={handleSaveReview} loading={saving}>
                  Confirm &amp; Save
                </Button>
              )}
              {saved && (
                <button onClick={reset} className="text-sm font-semibold text-accent-soft">
                  Upload another document
                </button>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </GlassSurface>
    );
  }

  return null;
}
