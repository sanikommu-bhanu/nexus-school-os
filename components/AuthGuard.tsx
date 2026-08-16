"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser } from "@/hooks/useAuthUser";
import { LoadingState, ErrorState } from "@/components/ui/States";
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
  const { user, profile, loading, error, refresh } = useAuthUser();
  const router = useRouter();
  // Whether we've already re-read users/{uid} for a signed-in user whose
  // profile came back missing. See the guard clause in the effect.
  const [recheckedMissingProfile, setRecheckedMissingProfile] = useState(false);

  // Derived once and used for BOTH the redirect and the render decision,
  // so the two can never disagree.
  const roleAllowed = !allowRoles || (!!profile && allowRoles.includes(profile.role));
  const onboardedEnough = !requireOnboarded || !!profile?.onboardingComplete;
  // "Signed in, but no profile" gets exactly one re-read before it is
  // believed — never a redirect on the first sighting.
  const awaitingProfileRecheck = !!user && !profile && !error && !recheckedMissingProfile;

  useEffect(() => {
    if (loading || error) return;

    // THE SIGN-UP RACE. Account creation fires onAuthStateChanged before
    // ensureUserProfile writes users/{uid}, so the shared auth store can
    // legitimately hold profile:null for a user whose profile landed a
    // moment later. Redirecting on that first sighting threw brand-new
    // students back to /role the instant they signed up — login looked
    // like it silently failed.
    //
    // One re-read costs a single document get and settles it: a real
    // profile renders the screen, a genuinely absent one falls through to
    // the /role redirect below on the next pass.
    if (user && !profile && !recheckedMissingProfile) {
      setRecheckedMissingProfile(true);
      void refresh();
      return;
    }

    if (!user) {
      // /role, not /auth. Two reasons, and the first is a correctness one:
      //
      // Signing out happens on a screen INSIDE this guard, so the auth
      // listener fires here the moment it completes and this redirect
      // races the one in the sign-out handler. Pointing both at /role
      // means whichever wins, the user lands in the same place — rather
      // than sometimes on the role picker and sometimes on a sign-in
      // screen already pinned to whatever role the URL happened to carry.
      //
      // Second, /role is the right destination on its own merits: it's
      // where the app's own entry chain goes (splash -> onboarding ->
      // role -> auth), it resumes a signed-in user straight to their
      // dashboard, and it hands /auth an explicit role instead of letting
      // it default everyone to "student".
      router.replace("/role");
      return;
    }

    if (!profile) {
      router.replace("/role");
      return;
    }

    if (!roleAllowed) {
      // Role mismatch — never render another role's data. Send them
      // to their own correct home instead of a bare error page.
      router.replace(profile.onboardingComplete ? `/${profile.role}` : `/setup/${profile.role}`);
      return;
    }

    if (!onboardedEnough) {
      router.replace(`/setup/${profile.role}`);
    }
  }, [loading, error, user, profile, roleAllowed, onboardedEnough, recheckedMissingProfile, refresh, router]);

  // A failed profile read is not "not signed in" — routing to /auth on it
  // would bounce a perfectly valid session out of the app over a blip.
  if (error) {
    return (
      <main className="nexus-atmosphere flex min-h-dvh items-center justify-center">
        <ErrorState message="We couldn't load your profile. Check your connection and try again." onRetry={refresh} />
      </main>
    );
  }

  // `roleAllowed`/`onboardedEnough` are part of this check, not just of
  // the effect above. router.replace() is asynchronous, so with only the
  // user/profile check here the guard rendered a full frame of the WRONG
  // role's screen before navigating away — long enough for that screen's
  // effects to fire a round of Firestore queries the user has no
  // permission for, producing console errors and, on a slow redirect, a
  // visible flash of another role's dashboard.
  if (loading || awaitingProfileRecheck || !user || !profile || !roleAllowed || !onboardedEnough) {
    return (
      <main className="nexus-atmosphere flex min-h-dvh items-center justify-center">
        <LoadingState message="Loading your workspace…" />
      </main>
    );
  }

  return <>{children}</>;
}
