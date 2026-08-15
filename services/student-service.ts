// ============================================================
// Student profile service — students/{userId}
// ============================================================
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { generateJoinCode } from "@/lib/utils";
import { updateUserProfile } from "@/services/user-service";
import type { StudentProfile } from "@/types";
export async function getStudentsForSchool(schoolId: string): Promise<StudentProfile[]> {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, "students"), where("schoolId", "==", schoolId)));
  return snap.docs.map((d) => d.data() as StudentProfile);
}

export async function getStudentsForClass(schoolId: string, classId: string): Promise<StudentProfile[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, "students"), where("schoolId", "==", schoolId), where("classId", "==", classId))
  );
  return snap.docs.map((d) => d.data() as StudentProfile);
}

export async function createStudentProfile(
  userId: string,
  schoolId: string,
  classId: string,
  data: Pick<StudentProfile, "rollNumber" | "dateOfBirth" | "gender">,
  fullName: string
): Promise<StudentProfile> {
  if (!db) throw new Error("Firebase isn't configured.");

  const parentLinkCode = generateJoinCode("NXP", 6);

  const profile: StudentProfile = {
    userId,
    schoolId,
    classId,
    parentLinkCode,
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, "students", userId), {
    ...profile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Denormalized, deliberately non-sensitive preview doc keyed by the
  // link code itself (not queried by field — looked up by document ID).
  // This is what lets the Parent Connect flow resolve a code to a
  // child WITHOUT needing broad read access to the sensitive
  // `students`/`users` collections before any relationship exists —
  // see services/parent-link-service.ts and firestore.rules
  // (parentLinkPreviews only allows `get`, never `list`, so it can't
  // be enumerated — you can only look up a code you already have).
  // Best-effort: if this write fails, onboarding still succeeds; the
  // parent simply won't be able to link until it exists, which is
  // rare since the school/class docs it reads are already available.
  try {
    const [schoolSnap, classSnap] = await Promise.all([
      getDoc(doc(db, "schools", schoolId)),
      getDoc(doc(db, "schools", schoolId, "classes", classId)),
    ]);
    await setDoc(doc(db, "parentLinkPreviews", parentLinkCode), {
      code: parentLinkCode,
      studentId: userId,
      name: fullName,
      schoolId,
      classId,
      schoolName: schoolSnap.exists() ? ((schoolSnap.data() as { name?: string }).name ?? "") : "",
      className: classSnap.exists() ? ((classSnap.data() as { name?: string }).name ?? "") : "",
      createdAt: serverTimestamp(),
    });
  } catch {
    // non-fatal — see comment above
  }

  await updateUserProfile(userId, { schoolId, primaryClassId: classId, onboardingComplete: false });
  // onboardingComplete flips true once the parent-link step is reached
  // (student's own setup isn't "done" until they've had the chance to
  // invite a parent) — see app/setup/student/parent/page.tsx.

  return profile;
}

export async function getStudentProfile(userId: string): Promise<StudentProfile | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "students", userId));
  return snap.exists() ? (snap.data() as StudentProfile) : null;
}
