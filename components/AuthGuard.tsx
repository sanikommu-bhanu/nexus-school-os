"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/hooks/useAuthUser";
import { LoadingState } from "@/components/ui/States";
import type { Role } from "@/types";

interface AuthGuardProps {
  children: React.ReactNode;
  /**
   * If set, only users whose profile.role matches one of these are
   * allowed through — e.g. an admin route rejects a student session.
   */
  allowRoles?: Role[];
  /** If true (default), requires onboardingComplete before rendering children. */
  requireOnboarded?: boolean;
}

export function AuthGuard({ children, allowRoles, requireOnboarded = true }: AuthGuardProps) {
  const { user, profile, loading } = useAuthUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/auth");
      return;
    }

    if (!profile) {
      router.replace("/role");
      return;
    }

    if (allowRoles && !allowRoles.includes(profile.role)) {
      // Role mismatch — never render another role's data. Send them
      // to their own correct home instead of a bare error page.
      router.replace(profile.onboardingComplete ? `/${profile.role}` : `/setup/${profile.role}`);
      return;
    }

    if (requireOnboarded && !profile.onboardingComplete) {
      router.replace(`/setup/${profile.role}`);
    }
  }, [loading, user, profile, allowRoles, requireOnboarded, router]);

  if (loading || !user || !profile) {
    return (
      <main className="nexus-atmosphere flex min-h-dvh items-center justify-center">
        <LoadingState message="Loading your workspace…" />
      </main>
    );
  }

  return <>{children}</>;
}
