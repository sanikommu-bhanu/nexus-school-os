"use client";

import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { useAuthUser } from "@/hooks/useAuthUser";
import { LogOut } from "lucide-react";
import type { Role } from "@/types";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
};

export function DashboardStub({ role }: { role: Role }) {
  const { profile } = useAuthUser();
  const router = useRouter();

  const handleSignOut = async () => {
    if (auth) await signOut(auth);
    router.replace("/onboarding");
  };

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame">
        <div className="flex items-center justify-between pb-6 pt-8">
          <div>
            <p className="text-sm text-ink-muted">Good to see you,</p>
            <h1 className="text-xl font-bold text-ink">{profile?.fullName ?? ROLE_LABEL[role]}</h1>
          </div>
          <Avatar name={profile?.fullName ?? role} src={profile?.photoURL} size="lg" />
        </div>

        <GlassSurface rounded="3xl" className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-base font-semibold text-ink">{ROLE_LABEL[role]} Dashboard</p>
          <p className="max-w-[260px] text-sm text-ink-muted">
            You&apos;re fully onboarded and connected. The full {ROLE_LABEL[role].toLowerCase()} dashboard —
            stats, classes, attendance, messages — ships in Phase 3.
          </p>
        </GlassSurface>

        <button
          onClick={handleSignOut}
          className="mb-10 mt-6 flex items-center justify-center gap-2 text-sm font-medium text-ink-muted"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </main>
  );
}
