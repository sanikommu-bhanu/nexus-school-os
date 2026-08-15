"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getDocumentById, updateDocumentReview } from "@/services/document-service";
import type { DocumentMeta } from "@/types";
import { FileText, ExternalLink, Sparkles, AlertTriangle, Check } from "lucide-react";

const STATUS_TONE: Record<DocumentMeta["aiStatus"], "success" | "warning" | "danger" | "neutral" | "accent"> = {
  complete: "success",
  processing: "accent",
  not_started: "neutral",
  unavailable: "neutral",
  error: "danger",
};

export default function AdminDocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const { profile } = useAuthUser();
  const [doc, setDoc] = useState<DocumentMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [fieldsDraft, setFieldsDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const loadDoc = () => {
    if (!profile?.schoolId || !documentId) return;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const d = await getDocumentById(profile.schoolId!, documentId);
        setDoc(d);
        setSummaryDraft(d?.aiSummary ?? "");
        setFieldsDraft(d?.extractedFields ?? {});
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Couldn't load this document.");
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(loadDoc, [profile?.schoolId, documentId]);

  const handleSave = async () => {
    if (!profile?.schoolId || !doc) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateDocumentReview(profile.schoolId, doc.id, { aiSummary: summaryDraft, extractedFields: fieldsDraft });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save your review. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <PageHeader title="Document" subtitle={doc?.fileName} />
        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={loadDoc} />
        ) : !doc ? (
          <EmptyState title="Document not found" />
        ) : (
          <div className="flex flex-col gap-4">
            <GlassSurface rounded="2xl" className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15">
                <FileText className="h-5 w-5 text-accent-soft" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{doc.fileName}</p>
                <p className="text-xs text-ink-faint">{doc.documentType.replace("_", " ")} · {(doc.fileSize / 1024).toFixed(0)} KB</p>
              </div>
              <Badge tone={STATUS_TONE[doc.aiStatus]}>{doc.aiStatus === "unavailable" ? "AI unavailable" : doc.aiStatus}</Badge>
            </GlassSurface>

            <a href={doc.fileURL} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 text-sm font-semibold text-accent-soft">
              Open original file <ExternalLink className="h-3.5 w-3.5" />
            </a>

            {(doc.aiStatus === "unavailable" || doc.aiStatus === "error") && (
              <div className="flex items-start gap-2 rounded-2xl bg-white/6 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-xs text-ink-muted">
                  {doc.aiStatus === "unavailable"
                    ? "No AI provider is configured for this school, so no summary or fields were extracted. The file itself is safely stored."
                    : "NEXUS AI couldn't extract a summary from this file. You can add one manually below."}
                </p>
              </div>
            )}
            {doc.aiStatus === "complete" && (
              <div className="flex items-start gap-2 rounded-2xl bg-accent/10 p-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-soft" />
                <p className="text-xs text-ink-muted">This document is indexed — NEXUS AI can cite it when answering questions in its scope.</p>
              </div>
            )}

            <GlassSurface rounded="2xl" className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-ink">Summary</p>
              <textarea
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                placeholder="No summary yet — add one manually."
                className="input-glass min-h-[90px] resize-none text-sm"
              />
            </GlassSurface>

            {Object.keys(fieldsDraft).length > 0 && (
              <GlassSurface rounded="2xl" className="flex flex-col gap-3">
                <p className="text-sm font-semibold text-ink">Extracted Fields</p>
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
              </GlassSurface>
            )}

            {saved ? (
              <div className="flex items-center justify-center gap-2 py-1 text-sm text-success">
                <Check className="h-4 w-4" /> Saved.
              </div>
            ) : (
              <>
                {saveError && <p className="text-center text-xs font-medium text-danger">{saveError}</p>}
                <Button onClick={handleSave} loading={saving}>
                  Save Changes
                </Button>
              </>
            )}
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}
