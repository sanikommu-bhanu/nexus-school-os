"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getClassById } from "@/services/class-service";
import { createAnnouncement, getAnnouncementsForClass } from "@/services/announcement-service";
import type { Announcement, AnnouncementPriority, ClassEntity } from "@/types";
import { toDate } from "@/lib/utils";
import { Megaphone } from "lucide-react";

const PRIORITIES: AnnouncementPriority[] = ["normal", "important", "urgent"];

export default function TeacherClassAnnouncementsPage() {
  const { classId } = useParams<{ classId: string }>();
  const { profile } = useAuthUser();
  const [cls, setCls] = useState<ClassEntity | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", message: "", priority: "normal" as AnnouncementPriority });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = async () => {
    if (!profile?.schoolId || !classId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [c, a] = await Promise.all([getClassById(profile.schoolId, classId), getAnnouncementsForClass(profile.schoolId, classId)]);
      setCls(c);
      setAnnouncements(a);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load announcements.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.schoolId, classId]);

  const handleSend = async () => {
    if (!profile?.schoolId || !profile.id || !classId || !form.title || !form.message) return;
    setSending(true);
    setSendError(null);
    try {
      await createAnnouncement(profile.schoolId, profile.id, {
        title: form.title,
        message: form.message,
        audience: "class",
        priority: form.priority,
        classId,
      });
      setForm({ title: "", message: "", priority: "normal" });
      await load();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Couldn't send this announcement. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthGuard allowRoles={["teacher"]}>
      <AppShell role="teacher">
        <PageHeader title="Class Announcements" subtitle={cls?.name} />

        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : (
          <>
            <GlassSurface rounded="2xl" className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-ink">New Announcement</p>
              <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <textarea
                placeholder="Message"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className="input-glass min-h-[100px] resize-none"
              />
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setForm({ ...form, priority: p })}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                      form.priority === p ? "bg-accent text-white" : "glass-surface text-ink-muted"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {sendError && <p className="text-xs font-medium text-danger">{sendError}</p>}
              <Button onClick={handleSend} loading={sending} disabled={!form.title || !form.message}>
                Send to {cls?.name ?? "class"}
              </Button>
            </GlassSurface>

            <div className="mt-7">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Recent</p>
              {announcements.length === 0 ? (
                <EmptyState icon={<Megaphone className="h-5.5 w-5.5" />} title="No announcements yet" />
              ) : (
                <div className="flex flex-col gap-3">
                  {announcements.map((a) => (
                    <GlassSurface key={a.id} rounded="2xl" className="flex flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-ink">{a.title}</p>
                        <Badge tone={a.priority === "urgent" ? "danger" : a.priority === "important" ? "warning" : "accent"}>
                          {a.audience === "school" ? "School-wide" : "This class"}
                        </Badge>
                      </div>
                      <p className="text-sm text-ink-muted">{a.message}</p>
                      <p className="mt-1 text-[11px] text-ink-faint">
                        {toDate(a.createdAt)?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) ?? ""}
                      </p>
                    </GlassSurface>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}
