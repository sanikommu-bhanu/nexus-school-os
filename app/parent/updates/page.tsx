"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState } from "@/components/ui/States";
import { cn } from "@/lib/utils";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getSchoolAnnouncements, getAnnouncementsForClass } from "@/services/announcement-service";
import { getChildSnapshots } from "@/services/parent-view-service";
import { useSelectedChild } from "@/hooks/useSelectedChild";
import { subscribeToNotifications, markAllNotificationsRead } from "@/services/notification-service";
import type { Announcement, NotificationItem } from "@/types";
import { Megaphone, Bell, CheckCheck } from "lucide-react";

const TABS = ["announcements", "notifications"] as const;
type Tab = (typeof TABS)[number];

export default function ParentUpdatesPage() {
  const { profile } = useAuthUser();
  const { selectedChildId } = useSelectedChild();
  const [tab, setTab] = useState<Tab>("announcements");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.schoolId) return;
    (async () => {
      const children = await getChildSnapshots(profile.id);
      const child = children.find((c) => c.studentId === selectedChildId) ?? children[0];
      const a = child?.cls
        ? await getAnnouncementsForClass(profile.schoolId!, child.cls.id)
        : await getSchoolAnnouncements(profile.schoolId!);
      setAnnouncements(a);
      setLoading(false);
    })();
    const unsub = subscribeToNotifications(profile.schoolId, profile.id, setNotifications);
    return unsub;
  }, [profile?.schoolId, profile?.id, selectedChildId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <AuthGuard allowRoles={["parent"]}>
      <AppShell role="parent">
        <PageHeader title="Updates" showBack={false} />

        <div className="mb-5 flex gap-2 rounded-full glass-surface p-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("flex-1 rounded-full px-3 py-2 text-xs font-medium capitalize transition-colors", tab === t ? "bg-white/12 text-ink" : "text-ink-faint")}>
              {t}{t === "notifications" && unreadCount > 0 ? ` (${unreadCount})` : ""}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingState />
        ) : tab === "announcements" ? (
          announcements.length === 0 ? (
            <EmptyState icon={<Megaphone className="h-5.5 w-5.5" />} title="No announcements yet" />
          ) : (
            <div className="flex flex-col divide-y divide-white/6">
              {announcements.map((a) => (
                <ListRow key={a.id} title={a.title} subtitle={a.message} />
              ))}
            </div>
          )
        ) : (
          <>
            {notifications.length > 0 && unreadCount > 0 && (
              <button
                onClick={() => profile?.schoolId && markAllNotificationsRead(profile.schoolId, profile.id)}
                className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-accent-soft"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
            {notifications.length === 0 ? (
              <EmptyState icon={<Bell className="h-5.5 w-5.5" />} title="No notifications yet" />
            ) : (
              <div className="flex flex-col divide-y divide-white/6">
                {notifications.map((n) => (
                  <ListRow key={n.id} title={n.title} subtitle={n.message} trailing={!n.read && <span className="h-2 w-2 rounded-full bg-accent" />} />
                ))}
              </div>
            )}
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}
