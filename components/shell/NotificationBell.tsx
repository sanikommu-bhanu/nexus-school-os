"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { subscribeToNotifications } from "@/services/notification-service";
import type { Role } from "@/types";

export function NotificationBell({ schoolId, uid, role, href }: { schoolId?: string; uid?: string; role: Role; href?: string }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!schoolId || !uid) return;
    return subscribeToNotifications(schoolId, uid, (items) => {
      setUnread(items.filter((n) => !n.read).length);
    });
  }, [schoolId, uid]);

  return (
    <Link
      href={href ?? `/${role}/notifications`}
      aria-label="Notifications"
      className="relative flex h-10 w-10 items-center justify-center rounded-full glass-surface"
    >
      <Bell className="h-4.5 w-4.5 text-ink-muted" />
      {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger" />}
    </Link>
  );
}
