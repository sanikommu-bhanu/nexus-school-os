// ============================================================
// User service — the only place that reads/writes users/{uid}.
// Screens should never call Firestore directly; they call
// service functions, which keeps "one source of truth" real
// in code, not just in the design doc.
// ============================================================
import { db } from "@/lib/firebase";
import { doc, getDoc, getDocs, setDoc, serverTimestamp, updateDoc, documentId, collection, query, where } from "firebase/firestore";
import { stripUndefined } from "@/lib/utils";
import type { UserProfile } from "@/types";

/**
 * Batch-fetches user profiles by uid. Firestore's `in` operator caps
 * at 10 values, so we chunk — used anywhere a list screen needs
 * names/photos for a set of ids resolved from another collection
 * (teachers, students, class members) without N+1 reads.
 */
export async function getUserProfiles(uids: string[]): Promise<Map<string, UserProfile>> {
  const result = new Map<string, UserProfile>();
  if (!db || uids.length === 0) return result;
  const unique = Array.from(new Set(uids));
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 10) chunks.push(unique.slice(i, i + 10));

  await Promise.all(
    chunks.map(async (chunk) => {
      const snap = await getDocs(query(collection(db!, "users"), where(documentId(), "in", chunk)));
      snap.docs.forEach((d) => result.set(d.id, d.data() as UserProfile));
    })
  );
  return result;
}

export async function getCurrentUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

// stripUndefined now lives in lib/utils.ts — the same hazard it was
// written for (Firestore rejecting an explicit `undefined`) bit
// fee-service too, so it's shared rather than duplicated per service.
// The original bug it fixed here: signup created the Firebase Auth
// account, then the profile write threw on `photoURL: undefined`, so the
// user ended up authenticated with no users/{uid} doc — which every
// guard reads as "not onboarded" and bounces back to /role forever.

export async function createUserProfile(
  uid: string,
  data: Pick<UserProfile, "fullName" | "email" | "role" | "photoURL">
): Promise<void> {
  if (!db) throw new Error("Firebase isn't configured — add your project keys to .env.local.");
  await setDoc(doc(db, "users", uid), {
    id: uid,
    ...stripUndefined(data),
    onboardingComplete: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Creates users/{uid} only when it doesn't already exist, and returns the
 * profile either way. This is the self-heal path for an account that was
 * authenticated but never got a profile doc written; callers can use it
 * without first checking, and without clobbering an existing profile
 * (which would reset onboardingComplete and drop schoolId).
 */
export async function ensureUserProfile(
  uid: string,
  data: Pick<UserProfile, "fullName" | "email" | "role" | "photoURL">
): Promise<UserProfile> {
  const existing = await getCurrentUserProfile(uid);
  if (existing) return existing;
  await createUserProfile(uid, data);
  const created = await getCurrentUserProfile(uid);
  if (!created) throw new Error("Profile was created but couldn't be read back.");
  return created;
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  if (!db) throw new Error("Firebase isn't configured — add your project keys to .env.local.");
  await updateDoc(doc(db, "users", uid), {
    ...stripUndefined(data),
    updatedAt: serverTimestamp(),
  });
}
