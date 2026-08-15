"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { getCurrentUserProfile } from "@/services/user-service";
import type { UserProfile } from "@/types";

interface AuthUserState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

/**
 * Single hook every guarded screen uses to know "who is this and
 * what stage of onboarding are they at". Re-fetches the profile
 * whenever auth state changes, so a freshly-created profile is
 * picked up immediately after a setup step writes it.
 */
export function useAuthUser(): AuthUserState {
  const [state, setState] = useState<AuthUserState>({ user: null, profile: null, loading: true });

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setState({ user: null, profile: null, loading: false });
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, profile: null, loading: false });
        return;
      }
      const profile = await getCurrentUserProfile(user.uid);
      setState({ user, profile, loading: false });
    });

    return unsubscribe;
  }, []);

  return state;
}
