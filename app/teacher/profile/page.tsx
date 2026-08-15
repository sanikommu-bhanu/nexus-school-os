"use client";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { ProfileScreen } from "@/components/shell/ProfileScreen";
export default function TeacherProfilePage() {
  return (
    <AuthGuard allowRoles={["teacher"]}>
      <AppShell role="teacher"><ProfileScreen /></AppShell>
    </AuthGuard>
  );
}
