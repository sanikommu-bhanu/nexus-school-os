"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { subscribeToNotifications, markAllNotificationsRead, markNotificationRead } from "@/services/notification-service";
import type { NotificationItem, Role } from "@/types";
import { toDate } from "@/lib/utils";
import { Bell, CheckCheck } from "lucide-react";

// Takes `unknown`, not `string`: NotificationItem declares createdAt as
// a string but notification-service writes serverTimestamp() and reads
// back with a bare `as NotificationItem` cast, so what actually arrives
// is a Firestore Timestamp. `new Date(timestamp)` is Invalid Date, and
// this function turned that into the literal text "NaN d ago" on the
// bell screen. onSnapshot also surfaces createdAt as null for the brief
// moment between a local write and the server ack, which toDate maps to
// null rather than to the 1970 epoch.
function timeAgo(value: unknown) {
  const at = toDate(value);
  if (!at) return "Just now";
  const diffMs = Date.now() - at.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function NotificationsScreen({ role }: { role: Role }) {
  const { profile } = useAuthUser();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.schoolId || !profile.id) return;
    const unsub = subscribeToNotifications(profile.schoolId, profile.id, (items) => {
      setNotifications(items);
      setLoading(false);
    });
    return unsub;
  }, [profile?.schoolId, profile?.id]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <AuthGuard allowRoles={[role]}>
      <AppShell role={role}>
        <PageHeader
          title="Notifications"
          showBack={false}
          trailing={
            unreadCount > 0 ? (
              <button
                onClick={() => profile?.schoolId && markAllNotificationsRead(profile.schoolId, profile.id)}
                className="flex items-center gap-1.5 rounded-full glass-surface px-3 py-2 text-xs font-semibold text-accent-soft"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            ) : undefined
          }
        />

        {loading ? (
          <LoadingState />
        ) : notifications.length === 0 ? (
          <EmptyState icon={<Bell className="h-5.5 w-5.5" />} title="No notifications yet" message="Updates about attendance, assignments and messages will show up here." />
        ) : (
          <div className="flex flex-col divide-y divide-white/6">
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => !n.read && profile?.schoolId && markNotificationRead(profile.schoolId, n.id)}
                className="w-full text-left"
              >
                <ListRow
                  title={n.title}
                  subtitle={`${n.message} · ${timeAgo(n.createdAt)}`}
                  trailing={!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                />
              </button>
            ))}
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}
