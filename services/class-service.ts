// ============================================================
// Class service — the only place that reads/writes
// schools/{schoolId}/classes/{classId} and its members subcollection.
// ============================================================
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  serverTimestamp,
  increment,
  runTransaction,
} from "firebase/firestore";
import { generateClassCode } from "@/lib/utils";
import type { ClassEntity, ClassMember } from "@/types";

export async function createClass(
  schoolId: string,
  teacherId: string,
  data: Pick<ClassEntity, "name" | "grade" | "section" | "subject">
): Promise<ClassEntity> {
  if (!db) throw new Error("Firebase isn't configured.");

  let code = generateClassCode(data.grade, data.section, data.subject);
  const classRef = doc(collection(db, "schools", schoolId, "classes"));

  // Denormalize the teacher's display name onto the class doc itself
  // (self-read — the teacher is always reading their own profile here,
  // so this works regardless of school-membership rules). This is
  // what lets app/setup/student/page.tsx show "Teacher: ..." on the
  // class-code confirmation screen WITHOUT needing a cross-read of
  // users/{teacherId} — a brand-new student hasn't joined that
  // teacher's school yet at that point, so a direct users/ read would
  // fail under the tightened per-school users rule (see firestore.rules).
  const teacherSnap = await getDoc(doc(db, "users", teacherId));
  const teacherName = teacherSnap.exists() ? ((teacherSnap.data() as { fullName?: string }).fullName ?? "Teacher") : "Teacher";

  await runTransaction(db, async (tx) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await getDocs(
        query(collectionGroup(db!, "classes"), where("code", "==", code))
      );
      if (existing.empty) break;
      code = generateClassCode(data.grade, data.section, data.subject);
    }

    tx.set(classRef, {
      id: classRef.id,
      schoolId,
      teacherId,
      teacherName,
      code,
      studentCount: 0,
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    tx.set(doc(db, "schools", schoolId, "classes", classRef.id, "members", teacherId), {
      userId: teacherId,
      classId: classRef.id,
      schoolId,
      role: "teacher",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  const snap = await getDoc(classRef);
  return snap.data() as ClassEntity;
}

export async function getClassByCode(
  code: string
): Promise<(ClassEntity & { schoolId: string }) | null> {
  if (!db) return null;
  const normalized = code.trim().toUpperCase();
  const snap = await getDocs(query(collectionGroup(db, "classes"), where("code", "==", normalized)));
  if (snap.empty) return null;
  return snap.docs[0].data() as ClassEntity & { schoolId: string };
}

export async function getClassById(schoolId: string, classId: string): Promise<ClassEntity | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "schools", schoolId, "classes", classId));
  return snap.exists() ? (snap.data() as ClassEntity) : null;
}

/**
 * Joins a student to a class. Idempotent — scanning the same QR twice
 * (or a flaky network retry) never creates a duplicate membership.
 */
export async function joinClassAsStudent(
  schoolId: string,
  classId: string,
  studentId: string
): Promise<{ alreadyJoined: boolean }> {
  if (!db) throw new Error("Firebase isn't configured.");
  const memberRef = doc(db, "schools", schoolId, "classes", classId, "members", studentId);
  const existing = await getDoc(memberRef);
  if (existing.exists()) return { alreadyJoined: true };

  await setDoc(memberRef, {
    userId: studentId,
    classId,
    schoolId,
    role: "student",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "schools", schoolId, "classes", classId), {
    studentCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  return { alreadyJoined: false };
}

export async function getClassesForSchool(schoolId: string): Promise<ClassEntity[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "schools", schoolId, "classes"));
  return snap.docs.map((d) => d.data() as ClassEntity);
}

export async function getClassesForTeacher(schoolId: string, teacherId: string): Promise<ClassEntity[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, "schools", schoolId, "classes"), where("teacherId", "==", teacherId))
  );
  return snap.docs.map((d) => d.data() as ClassEntity);
}

export async function getClassMembers(schoolId: string, classId: string): Promise<ClassMember[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "schools", schoolId, "classes", classId, "members"));
  return snap.docs.map((d) => d.data() as ClassMember);
}
