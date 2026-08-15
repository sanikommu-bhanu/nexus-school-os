"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { subscribeToConversations } from "@/services/messaging-service";
import type { Role } from "@/types";

export function MessagesBell({ schoolId, uid, role }: { schoolId?: string; uid?: string; role: Role }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!schoolId || !uid) return;
    return subscribeToConversations(schoolId, uid, (items) => {
      setUnread(items.filter((c) => (c.unreadFor ?? []).includes(uid)).length);
    });
  }, [schoolId, uid]);

  return (
    <Link
      href={`/${role}/messages`}
      aria-label="Messages"
      className="relative flex h-10 w-10 items-center justify-center rounded-full glass-surface"
    >
      <MessageCircle className="h-4.5 w-4.5 text-ink-muted" />
      {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />}
    </Link>
  );
}
