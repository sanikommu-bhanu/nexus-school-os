// ============================================================
// User service — the only place that reads/writes users/{uid}.
// Screens should never call Firestore directly; they call
// service functions, which keeps "one source of truth" real
// in code, not just in the design doc.
// ============================================================
import { db } from "@/lib/firebase";
import { doc, getDoc, getDocs, setDoc, serverTimestamp, updateDoc, documentId, collection, query, where } from "firebase/firestore";
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

export async function createUserProfile(
  uid: string,
  data: Pick<UserProfile, "fullName" | "email" | "role" | "photoURL">
): Promise<void> {
  if (!db) return;
  await setDoc(doc(db, "users", uid), {
    id: uid,
    ...data,
    onboardingComplete: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, "users", uid), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}
