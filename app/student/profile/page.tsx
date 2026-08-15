"use client";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { ProfileScreen } from "@/components/shell/ProfileScreen";
export default function StudentProfilePage() {
  return (
    <AuthGuard allowRoles={["student"]}>
      <AppShell role="student"><ProfileScreen /></AppShell>
    </AuthGuard>
  );
}
