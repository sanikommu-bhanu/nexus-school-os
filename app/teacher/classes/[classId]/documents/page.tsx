"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListRow } from "@/components/ui/ListRow";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { cn } from "@/lib/utils";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getClassById } from "@/services/class-service";
import { getDocumentsForClass } from "@/services/document-service";
import { DocumentPipeline } from "@/components/ai/DocumentPipeline";
import type { ClassEntity, DocumentMeta, DocumentType } from "@/types";
import { FileText } from "lucide-react";

const TYPES: { value: DocumentType; label: string }[] = [
  { value: "syllabus", label: "Syllabus" },
  { value: "notes", label: "Notes" },
  { value: "question_paper", label: "Question Paper" },
  { value: "assignment", label: "Assignment" },
  { value: "other", label: "Other" },
];

export default function TeacherClassDocumentsPage() {
  const { classId } = useParams<{ classId: string }>();
  const { profile } = useAuthUser();
  const [cls, setCls] = useState<ClassEntity | null>(null);
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState<DocumentType>("notes");

  useEffect(() => {
    if (!profile?.schoolId || !classId) return;
    (async () => {
      const [c, d] = await Promise.all([getClassById(profile.schoolId!, classId), getDocumentsForClass(profile.schoolId!, classId)]);
      setCls(c);
      setDocs(d);
      setLoading(false);
    })();
  }, [profile?.schoolId, classId]);

  return (
    <AuthGuard allowRoles={["teacher"]}>
      <AppShell role="teacher">
        <PageHeader title="Documents" subtitle={cls?.name} />

        <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setDocType(t.value)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
                docType === t.value ? "bg-accent/20 text-accent-soft" : "glass-surface text-ink-muted"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {profile?.schoolId && profile.id && classId && (
          <DocumentPipeline
            schoolId={profile.schoolId}
            uploadedBy={profile.id}
            documentType={docType}
            classId={classId}
            ownerId={classId}
            onComplete={(doc) => setDocs((prev) => [doc, ...prev.filter((d) => d.id !== doc.id)])}
          />
        )}

        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Uploaded ({docs.length})</p>
          {loading ? (
            <LoadingState />
          ) : docs.length === 0 ? (
            <EmptyState icon={<FileText className="h-5.5 w-5.5" />} title="No documents yet" />
          ) : (
            <div className="flex flex-col divide-y divide-white/6">
              {docs.map((d) => (
                <ListRow
                  key={d.id}
                  leading={<FileText className="h-5 w-5 text-ink-faint" />}
                  title={d.fileName}
                  subtitle={d.aiStatus === "complete" ? "Indexed for NEXUS AI" : d.aiStatus === "unavailable" ? "AI unavailable" : d.aiStatus}
                />
              ))}
            </div>
          )}
        </div>
      </AppShell>
    </AuthGuard>
  );
}
