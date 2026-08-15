"use client";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { ProfileScreen } from "@/components/shell/ProfileScreen";
export default function AdminProfilePage() {
  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin"><ProfileScreen /></AppShell>
    </AuthGuard>
  );
}
