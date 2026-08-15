"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { cn } from "@/lib/utils";
import { ListRow } from "@/components/ui/ListRow";
import { EmptyState, LoadingState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getClassesForSchool } from "@/services/class-service";
import { getAttendanceForClassRange, summarizeAttendance, todayISO } from "@/services/attendance-service";
import { getSchoolDocuments } from "@/services/document-service";
import { DocumentPipeline } from "@/components/ai/DocumentPipeline";
import { createAnnouncement } from "@/services/announcement-service";
import { subscribeToNotifications, markAllNotificationsRead, markNotificationRead } from "@/services/notification-service";
import { Input } from "@/components/ui/Input";
import type { ClassEntity, DocumentMeta, NotificationItem } from "@/types";
import { FileText, Megaphone, Bell, CheckCheck } from "lucide-react";

const TABS = ["attendance", "documents", "announce", "alerts"] as const;
type Tab = (typeof TABS)[number];

function AdminOperationsScreen() {
  const { profile } = useAuthUser();
  const params = useSearchParams();
  const initialTab = (params.get("tab") as Tab) ?? "attendance";
  const [tab, setTab] = useState<Tab>(TABS.includes(initialTab) ? initialTab : "attendance");
  const [classes, setClasses] = useState<(ClassEntity & { todayPct: number | null })[]>([]);
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [announceForm, setAnnounceForm] = useState({ title: "", message: "" });
  const [announcing, setAnnouncing] = useState(false);
  const [announceError, setAnnounceError] = useState<string | null>(null);
  const [announced, setAnnounced] = useState(false);

  useEffect(() => {
    if (!profile?.schoolId || !profile.id) return;
    const unsub = subscribeToNotifications(profile.schoolId, profile.id, setNotifications);
    return unsub;
  }, [profile?.schoolId, profile?.id]);

  const loadOperationsData = () => {
    if (!profile?.schoolId) return;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [c, d] = await Promise.all([getClassesForSchool(profile.schoolId!), getSchoolDocuments(profile.schoolId!)]);
        const withToday = await Promise.all(
          c.map(async (cls) => {
            const records = await getAttendanceForClassRange(profile.schoolId!, cls.id, todayISO());
            const today = records.filter((r) => r.date === todayISO());
            return { ...cls, todayPct: today.length > 0 ? summarizeAttendance(today).percentPresent : null };
          })
        );
        setClasses(withToday);
        setDocs(d);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Couldn't load operations data.");
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(loadOperationsData, [profile?.schoolId]);

  const handleAnnounce = async () => {
    if (!profile?.schoolId || !profile.id || !announceForm.title || !announceForm.message) return;
    setAnnouncing(true);
    setAnnounceError(null);
    try {
      await createAnnouncement(profile.schoolId, profile.id, {
        title: announceForm.title,
        message: announceForm.message,
        audience: "school",
        priority: "normal",
      });
      setAnnounced(true);
      setAnnounceForm({ title: "", message: "" });
    } catch (err) {
      setAnnounceError(err instanceof Error ? err.message : "Couldn't post this announcement. Try again.");
    } finally {
      setAnnouncing(false);
    }
  };

  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <PageHeader title="Operations" subtitle="Attendance, documents & announcements" />

        <div className="mb-5 flex gap-2 rounded-full glass-surface p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-full px-3 py-2 text-xs font-medium capitalize transition-colors",
                tab === t ? "bg-white/12 text-ink" : "text-ink-faint"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={loadOperationsData} />
        ) : tab === "attendance" ? (
          classes.length === 0 ? (
            <EmptyState title="No classes yet" />
          ) : (
            <div className="flex flex-col divide-y divide-white/6">
              {classes.map((c) => (
                <ListRow
                  key={c.id}
                  href={`/admin/classes/${c.id}`}
                  title={c.name}
                  subtitle={c.subject}
                  trailing={
                    <span className={cn("text-sm font-semibold", c.todayPct === null ? "text-ink-faint" : c.todayPct < 75 ? "text-danger" : "text-success")}>
                      {c.todayPct === null ? "Not marked" : `${c.todayPct}%`}
                    </span>
                  }
                />
              ))}
            </div>
          )
        ) : tab === "documents" ? (
          <>
            {profile?.schoolId && profile.id && (
              <DocumentPipeline
                schoolId={profile.schoolId}
                uploadedBy={profile.id}
                documentType="other"
                ownerId={profile.schoolId}
                onComplete={(doc) => setDocs((prev) => [doc, ...prev.filter((d) => d.id !== doc.id)])}
              />
            )}
            <div className="mt-5 flex flex-col divide-y divide-white/6">
              {docs.length === 0 ? (
                <EmptyState icon={<FileText className="h-5.5 w-5.5" />} title="No documents yet" />
              ) : (
                docs.map((d) => (
                  <ListRow
                    key={d.id}
                    href={`/admin/operations/documents/${d.id}`}
                    leading={<FileText className="h-5 w-5 text-ink-faint" />}
                    title={d.fileName}
                    subtitle={d.aiStatus === "unavailable" ? "AI unavailable" : d.aiStatus === "complete" ? "Indexed for NEXUS AI" : d.aiStatus}
                  />
                ))
              )}
            </div>
          </>
        ) : tab === "announce" ? (
          <GlassSurface rounded="2xl" className="flex flex-col gap-3">
            {announced ? (
              <div className="flex items-center gap-2 py-2 text-sm text-success">
                <Megaphone className="h-4 w-4" /> Announcement sent to the whole school.
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-ink">New School Announcement</p>
                <Input placeholder="Title" value={announceForm.title} onChange={(e) => setAnnounceForm({ ...announceForm, title: e.target.value })} />
                <textarea
                  placeholder="Message"
                  value={announceForm.message}
                  onChange={(e) => setAnnounceForm({ ...announceForm, message: e.target.value })}
                  className="input-glass min-h-[100px] resize-none"
                />
                {announceError && <p className="text-xs font-medium text-danger">{announceError}</p>}
                <Button onClick={handleAnnounce} loading={announcing} disabled={!announceForm.title || !announceForm.message}>
                  Send to School
                </Button>
              </>
            )}
          </GlassSurface>
        ) : (
          <GlassSurface rounded="2xl" className="flex flex-col gap-1">
            {notifications.filter((n) => !n.read).length > 0 && (
              <button
                onClick={() => profile?.schoolId && markAllNotificationsRead(profile.schoolId, profile.id)}
                className="mb-2 flex items-center gap-1.5 self-start text-xs font-semibold text-accent-soft"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
            {notifications.length === 0 ? (
              <EmptyState icon={<Bell className="h-5.5 w-5.5" />} title="No notifications yet" />
            ) : (
              <div className="flex flex-col divide-y divide-white/6">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => !n.read && profile?.schoolId && markNotificationRead(profile.schoolId, n.id)}
                    className="w-full text-left"
                  >
                    <ListRow title={n.title} subtitle={n.message} trailing={!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />} />
                  </button>
                ))}
              </div>
            )}
          </GlassSurface>
        )}
      </AppShell>
    </AuthGuard>
  );
}

// Suspense boundary required by useSearchParams() — see app/auth/page.tsx.
// Without it `next build` fails this route outright.
export default function AdminOperationsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AdminOperationsScreen />
    </Suspense>
  );
}
