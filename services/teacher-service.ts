// ============================================================
// Teacher profile service — teachers/{userId}
// ============================================================
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  arrayUnion,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { updateUserProfile } from "@/services/user-service";
import type { TeacherProfile } from "@/types";

export async function getTeachersForSchool(schoolId: string): Promise<TeacherProfile[]> {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, "teachers"), where("schoolId", "==", schoolId)));
  return snap.docs.map((d) => d.data() as TeacherProfile);
}

export async function createTeacherProfile(
  userId: string,
  schoolId: string,
  data: Pick<TeacherProfile, "subject" | "department">
): Promise<void> {
  if (!db) throw new Error("Firebase isn't configured.");

  await setDoc(doc(db, "teachers", userId), {
    userId,
    schoolId,
    classIds: [],
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateUserProfile(userId, { schoolId, onboardingComplete: true });
}

export async function getTeacherProfile(userId: string): Promise<TeacherProfile | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "teachers", userId));
  return snap.exists() ? (snap.data() as TeacherProfile) : null;
}

export async function attachClassToTeacher(userId: string, classId: string): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, "teachers", userId), {
    classIds: arrayUnion(classId),
    updatedAt: serverTimestamp(),
  });
}
