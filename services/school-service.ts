// ============================================================
// School service — the only place that reads/writes schools/{id}
// and schools/{id}/members/{uid}. Mirrors user-service.ts's pattern.
// ============================================================
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import { generateJoinCode } from "@/lib/utils";
import type { School, SchoolMember, Role } from "@/types";

export async function createSchool(
  ownerId: string,
  data: Pick<School, "name" | "type" | "city" | "state" | "logoURL" | "contactEmail" | "contactPhone">
): Promise<School> {
  if (!db) throw new Error("Firebase isn't configured.");

  // Collision-resistant code, verified unique via transaction read.
  let code = generateJoinCode("SCH");
  const schoolRef = doc(collection(db, "schools"));

  await runTransaction(db, async (tx) => {
    // Retry a few times in the unlikely event of a collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await getDocs(query(collection(db, "schools"), where("code", "==", code)));
      if (existing.empty) break;
      code = generateJoinCode("SCH");
    }

    tx.set(schoolRef, {
      id: schoolRef.id,
      ownerId,
      code,
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    tx.set(doc(db, "schools", schoolRef.id, "members", ownerId), {
      userId: ownerId,
      schoolId: schoolRef.id,
      role: "admin" as Role,
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  const snap = await getDoc(schoolRef);
  return snap.data() as School;
}

export async function getSchoolByCode(code: string): Promise<School | null> {
  if (!db) return null;
  const normalized = code.trim().toUpperCase();
  const snap = await getDocs(query(collection(db, "schools"), where("code", "==", normalized)));
  if (snap.empty) return null;
  return snap.docs[0].data() as School;
}

export async function getSchoolById(schoolId: string): Promise<School | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "schools", schoolId));
  return snap.exists() ? (snap.data() as School) : null;
}

export async function addSchoolMember(
  schoolId: string,
  userId: string,
  role: Role
): Promise<{ alreadyMember: boolean }> {
  if (!db) throw new Error("Firebase isn't configured.");
  const memberRef = doc(db, "schools", schoolId, "members", userId);
  const existing = await getDoc(memberRef);
  if (existing.exists()) return { alreadyMember: true };

  await setDoc(memberRef, {
    userId,
    schoolId,
    role,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { alreadyMember: false };
}

export async function getSchoolMembers(schoolId: string): Promise<SchoolMember[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "schools", schoolId, "members"));
  return snap.docs.map((d) => d.data() as SchoolMember);
}
