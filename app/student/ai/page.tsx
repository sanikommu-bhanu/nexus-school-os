"use client";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { NexusAiChat } from "@/components/ai/NexusAiChat";
import { useAuthUser } from "@/hooks/useAuthUser";

export default function StudentAiPage() {
  const { profile } = useAuthUser();
  return (
    <AuthGuard allowRoles={["student"]}>
      <AppShell role="student">
        <PageHeader title="NEXUS AI" showBack={false} />
        {profile && (
          <NexusAiChat uid={profile.id} prompts={["What's my attendance?", "What's on my schedule today?", "Do I have assignments due?"]} />
        )}
      </AppShell>
    </AuthGuard>
  );
}
