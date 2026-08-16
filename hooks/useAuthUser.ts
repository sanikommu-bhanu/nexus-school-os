"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, isFirebaseConfigured } from "@/lib/firebase";
import { getCurrentUserProfile } from "@/services/user-service";
import type { UserProfile } from "@/types";

interface AuthUserState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  /**
   * Set when the profile read itself failed (offline, rules, a bad
   * project id) — distinct from `profile === null`, which legitimately
   * means "signed in, no users/{uid} doc yet".
   */
  error: Error | null;
}

// ============================================================
// ONE auth listener and ONE users/{uid} read per session, shared by
// every consumer of the hook.
//
// This used to be per-component: each useAuthUser() call opened its own
// onAuthStateChanged subscription AND issued its own getDoc for the same
// user document. AuthGuard calls it, the page inside the guard calls it,
// and shell components (ProfileScreen, MessagesListScreen,
// NotificationsScreen, ChatThreadScreen) call it again — so a single
// screen did the same profile round-trip 2-3 times, on every navigation,
// with 51 call sites across the app. That is a large part of why the app
// felt laggy: the guard's spinner could not clear until its own
// duplicate read returned, and the reads were serial per component
// mount rather than shared.
//
// The store below keeps the resolved state in module scope, so the
// second and third consumers on a screen render from memory instantly
// and no extra Firestore traffic is generated.
// ============================================================

type Listener = (s: AuthUserState) => void;

const UNRESOLVED: AuthUserState = { user: null, profile: null, loading: true, error: null };

let state: AuthUserState = UNRESOLVED;
const listeners = new Set<Listener>();
let started = false;
/** De-dupes concurrent profile reads for the same uid. */
let inflight: Promise<void> | null = null;

function emit(next: AuthUserState) {
  state = next;
  listeners.forEach((l) => l(next));
}

async function loadProfile(user: User) {
  try {
    const profile = await getCurrentUserProfile(user.uid);
    emit({ user, profile, loading: false, error: null });
  } catch (err) {
    // A rejected profile read must still clear `loading`. Without this
    // the callback rejected and every guard in the app sat on "Loading
    // your workspace…" forever, with no error and no way out but a
    // reload.
    emit({
      user,
      profile: null,
      loading: false,
      error: err instanceof Error ? err : new Error("Couldn't load your profile."),
    });
  } finally {
    inflight = null;
  }
}

function start() {
  if (started) return;
  started = true;

  if (!isFirebaseConfigured || !auth) {
    emit({ user: null, profile: null, loading: false, error: null });
    return;
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      inflight = null;
      emit({ user: null, profile: null, loading: false, error: null });
      return;
    }
    // Drop a previous account's profile on a genuine account switch, but
    // keep it across a same-user event so screens don't flash empty.
    const sameUser = state.user?.uid === user.uid;
    emit({ user, profile: sameUser ? state.profile : null, loading: true, error: null });
    inflight = loadProfile(user);
  });
}

/** Re-reads users/{uid} once and pushes the result to every consumer. */
async function refreshShared() {
  const user = auth?.currentUser;
  if (!user) return;
  if (inflight) return inflight; // a read is already on the wire — join it
  emit({ ...state, user, loading: true });
  inflight = loadProfile(user);
  return inflight;
}

/**
 * Pushes a just-written profile straight into the shared store.
 *
 * Called by the sign-up/sign-in paths the moment they create or resolve
 * users/{uid}. Without it those flows rely on the AuthGuard re-read
 * below, which works but costs the brand-new user a spinner and an extra
 * document get on their very first screen. The writer already knows the
 * answer — handing it over is both faster and less racy than asking
 * Firestore again.
 */
export function publishAuthProfile(profile: UserProfile) {
  if (auth?.currentUser?.uid !== profile.id) return; // not the active session
  emit({ user: auth.currentUser, profile, loading: false, error: null });
}

/**
 * True when the store is caching "signed in, but this user has no
 * users/{uid} document".
 *
 * That state is NEVER authoritative, and trusting it caused a hard
 * regression: sign-up calls createUserWithEmailAndPassword (or
 * signInWithPopup) FIRST, which fires onAuthStateChanged immediately —
 * so the store reads users/{uid} before ensureUserProfile has written
 * it, and caches profile:null. The profile then lands a moment later,
 * but nothing invalidated the cache, so the next screen's AuthGuard saw
 * "no profile" and bounced the brand-new user straight back to /role.
 * Login looked like it simply didn't work.
 *
 * The old per-component hook re-read users/{uid} on every mount, which
 * hid this by accident. The shared store has to invalidate deliberately.
 */
function hasUnverifiedMissingProfile(s: AuthUserState): boolean {
  return !!s.user && !s.profile && !s.error && !s.loading;
}

/**
 * Single hook every guarded screen uses to know "who is this and
 * what stage of onboarding are they at". Backed by the shared store
 * above, so mounting it N times on one screen costs one read, not N.
 */
export function useAuthUser(): AuthUserState & { refresh: () => Promise<void> } {
  const [local, setLocal] = useState<AuthUserState>(state);

  useEffect(() => {
    start();
    // Adopt whatever the store already resolved while this component was
    // mounting — otherwise a late-mounting consumer would render the
    // stale snapshot captured by useState's initializer.
    setLocal(state);
    listeners.add(setLocal);
    // Re-verify a cached "no profile" once per mount. This is what makes
    // a just-written profile visible to the next screen — see
    // hasUnverifiedMissingProfile. It costs one read only in the case
    // that would otherwise redirect the user away, and it settles: a user
    // who genuinely has no profile lands on /role, which writes one.
    if (hasUnverifiedMissingProfile(state)) void refreshShared();
    return () => {
      listeners.delete(setLocal);
    };
  }, []);

  const refresh = useCallback(async () => {
    await refreshShared();
  }, []);

  return { ...local, refresh };
}
