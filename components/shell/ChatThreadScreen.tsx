"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState, EmptyState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  getConversation,
  subscribeToMessages,
  sendMessage,
  markConversationRead,
  otherParticipant,
} from "@/services/messaging-service";
import { getUserProfiles } from "@/services/user-service";
import type { ConversationMeta, MessageItem, Role, UserProfile } from "@/types";
import { cn } from "@/lib/utils";

function roleLabel(role?: string) {
  if (!role) return undefined;
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function ChatThreadScreen({ role }: { role: Role }) {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { profile } = useAuthUser();
  const router = useRouter();
  const [convo, setConvo] = useState<ConversationMeta | null>(null);
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profile?.schoolId || !conversationId || !profile.id) return;
    (async () => {
      const c = await getConversation(profile.schoolId!, conversationId);
      setConvo(c);
      if (c) {
        const otherId = otherParticipant(c, profile.id);
        if (otherId) {
          const users = await getUserProfiles([otherId]);
          setOtherUser(users.get(otherId) ?? null);
        }
        markConversationRead(profile.schoolId!, conversationId, profile.id).catch(() => {});
      }
      setLoading(false);
    })();

    const unsub = subscribeToMessages(profile.schoolId, conversationId, setMessages);
    return unsub;
  }, [profile?.schoolId, profile?.id, conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    if (!profile?.schoolId || !profile.id || !convo || !text.trim() || sending) return;
    const recipientId = otherParticipant(convo, profile.id);
    if (!recipientId) return;
    const value = text;
    setText("");
    setSending(true);
    try {
      await sendMessage(profile.schoolId, conversationId, profile.id, recipientId, value);
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthGuard allowRoles={[role]}>
      <AppShell role={role}>
        <PageHeader
          title={otherUser?.fullName ?? "Conversation"}
          subtitle={roleLabel(otherUser?.role)}
          onBack={() => router.push(`/${role}/messages`)}
        />

        {loading ? (
          <LoadingState />
        ) : !convo ? (
          <EmptyState title="Conversation not found" />
        ) : (
          <div className="flex flex-col gap-2.5 pb-24">
            {messages.length === 0 ? (
              <EmptyState title="Say hello" message={`Start the conversation with ${otherUser?.fullName ?? "them"}.`} />
            ) : (
              messages.map((m) => {
                const mine = m.senderId === profile?.id;
                return (
                  <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-snug",
                        mine ? "bg-accent text-white" : "glass-surface text-ink"
                      )}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </AppShell>

      {convo && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4">
          <div className="glass-surface pointer-events-auto flex w-full max-w-[440px] items-center gap-2 rounded-full p-1.5 shadow-glass">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Message…"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-faint outline-none"
            />
            <button
              onClick={handleSend}
              disabled={sending || !text.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
