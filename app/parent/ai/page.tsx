"use client";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { NexusAiChat } from "@/components/ai/NexusAiChat";
import { useAuthUser } from "@/hooks/useAuthUser";

export default function ParentAiPage() {
  const { profile } = useAuthUser();
  return (
    <AuthGuard allowRoles={["parent"]}>
      <AppShell role="parent">
        <PageHeader title="NEXUS AI" showBack={false} />
        {profile && (
          <NexusAiChat uid={profile.id} prompts={["How is my child doing?", "Any assignments due soon?", "What's today's schedule?"]} />
        )}
      </AppShell>
    </AuthGuard>
  );
}
