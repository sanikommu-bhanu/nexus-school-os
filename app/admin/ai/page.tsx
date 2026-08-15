"use client";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { NexusAiChat } from "@/components/ai/NexusAiChat";
import { useAuthUser } from "@/hooks/useAuthUser";

export default function AdminAiPage() {
  const { profile } = useAuthUser();
  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <PageHeader title="NEXUS AI" showBack={false} />
        {profile && (
          <NexusAiChat
            uid={profile.id}
            prompts={["What needs my attention today?", "Which classes have attendance issues?", "Show me today's school overview"]}
          />
        )}
      </AppShell>
    </AuthGuard>
  );
}
