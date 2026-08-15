"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { LoadingState, EmptyState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { subscribeToConversations, otherParticipant } from "@/services/messaging-service";
import { getUserProfiles } from "@/services/user-service";
import type { ConversationMeta, Role, UserProfile } from "@/types";
import { MessageCircle, SquarePen } from "lucide-react";

export function MessagesListScreen({ role, newHref }: { role: Role; newHref?: string }) {
  const { profile } = useAuthUser();
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [users, setUsers] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.schoolId || !profile.id) return;
    const unsub = subscribeToConversations(profile.schoolId, profile.id, async (items) => {
      setConversations(items);
      const otherIds = items.map((c) => otherParticipant(c, profile.id)).filter(Boolean) as string[];
      setUsers(await getUserProfiles(otherIds));
      setLoading(false);
    });
    return unsub;
  }, [profile?.schoolId, profile?.id]);

  return (
    <AuthGuard allowRoles={[role]}>
      <AppShell role={role}>
        <PageHeader
          title="Messages"
          showBack={false}
          trailing={
            newHref ? (
              <Link href={newHref} aria-label="New message" className="flex h-9 w-9 items-center justify-center rounded-full glass-surface">
                <SquarePen className="h-4 w-4 text-ink-muted" />
              </Link>
            ) : undefined
          }
        />
        {loading ? (
          <LoadingState />
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="h-5.5 w-5.5" />}
            title="No conversations yet"
            message={newHref ? "Tap the compose button above to start one." : "Conversations you start will show up here."}
          />
        ) : (
          <div className="flex flex-col divide-y divide-white/6">
            {conversations.map((c) => {
              const otherId = profile ? otherParticipant(c, profile.id) : undefined;
              const user = otherId ? users.get(otherId) : undefined;
              const unread = profile ? (c.unreadFor ?? []).includes(profile.id) : false;
              return (
                <Link
                  key={c.id}
                  href={`/${role}/messages/${c.id}`}
                  className="flex items-center gap-3 px-1 py-3 active:scale-[0.99] transition-transform"
                >
                  <Avatar name={user?.fullName ?? "Contact"} src={user?.photoURL} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${unread ? "font-bold text-ink" : "font-semibold text-ink"}`}>
                      {user?.fullName ?? "Contact"}
                    </p>
                    <p className="truncate text-xs text-ink-muted">{c.lastMessage ?? "No messages yet"}</p>
                  </div>
                  {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                </Link>
              );
            })}
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}
