"use client";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { ProfileScreen } from "@/components/shell/ProfileScreen";
export default function ParentProfilePage() {
  return (
    <AuthGuard allowRoles={["parent"]}>
      <AppShell role="parent"><ProfileScreen /></AppShell>
    </AuthGuard>
  );
}
