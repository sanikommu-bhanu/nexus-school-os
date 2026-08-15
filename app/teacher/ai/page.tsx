"use client";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { NexusAiChat } from "@/components/ai/NexusAiChat";
import { useAuthUser } from "@/hooks/useAuthUser";

export default function TeacherAiPage() {
  const { profile } = useAuthUser();
  return (
    <AuthGuard allowRoles={["teacher"]}>
      <AppShell role="teacher">
        <PageHeader title="NEXUS AI" showBack={false} />
        {profile && (
          <NexusAiChat
            uid={profile.id}
            prompts={["Which students are below 75% attendance?", "What's on my schedule today?", "Summarize pending assignments"]}
          />
        )}
      </AppShell>
    </AuthGuard>
  );
}
