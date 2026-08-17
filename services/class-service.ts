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
  onSnapshot,
  serverTimestamp,
  increment,
  runTransaction,
} from "firebase/firestore";
import { generateClassCode } from "@/lib/utils";
import { addSchoolMember } from "@/services/school-service";
import type { ClassEntity, ClassMember } from "@/types";

export async function createClass(
  schoolId: string,
  teacherId: string,
  data: Pick<ClassEntity, "name" | "grade" | "section" | "subject">
): Promise<ClassEntity> {
  if (!db) throw new Error("Firebase isn't configured.");
  // Local const so the null-check narrowing survives into the
  // transaction closure below (see school-service.ts for the same note).
  const database = db;

  let code = generateClassCode(data.grade, data.section, data.subject);
  const classRef = doc(collection(database, "schools", schoolId, "classes"));

  // Denormalize the teacher's display name onto the class doc itself
  // (self-read — the teacher is always reading their own profile here,
  // so this works regardless of school-membership rules). This is
  // what lets app/setup/student/page.tsx show "Teacher: ..." on the
  // class-code confirmation screen WITHOUT needing a cross-read of
  // users/{teacherId} — a brand-new student hasn't joined that
  // teacher's school yet at that point, so a direct users/ read would
  // fail under the tightened per-school users rule (see firestore.rules).
  const teacherSnap = await getDoc(doc(database, "users", teacherId));
  const teacherName = teacherSnap.exists() ? ((teacherSnap.data() as { fullName?: string }).fullName ?? "Teacher") : "Teacher";

  // Uniqueness scan runs BEFORE the transaction — `getDocs` is not a
  // transactional read, so inside the callback it bought no atomicity
  // while re-running on every retry (same fix as createSchool).
  //
  // It is also STRICTLY BEST-EFFORT, and the try/catch is the point.
  //
  // This is a collectionGroup query, which Firestore only authorises via
  // a rule whose path uses a recursive wildcard. Until that rule is
  // deployed the query returns permission-denied — and because the
  // rejection used to propagate, a purely advisory duplicate check
  // aborted the entire transaction below and NO TEACHER COULD CREATE A
  // CLASS AT ALL. The actual class write needs none of this: it is
  // authorised by plain school membership.
  //
  // Losing the scan costs a vanishingly small chance of a duplicate code
  // (the random suffix is 4 chars over a 32-symbol alphabet, scoped to
  // one grade/section/subject). Losing class creation costs the teacher
  // the entire product. Degrade, don't fail.
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await getDocs(
        query(collectionGroup(database, "classes"), where("code", "==", code))
      );
      if (existing.empty) break;
      code = generateClassCode(data.grade, data.section, data.subject);
    }
  } catch (err) {
    console.warn(
      "Class-code uniqueness check couldn't run; proceeding with the generated code. " +
        "If this is permission-denied, deploy firestore.rules — the collectionGroup rule for /{path=**}/classes/{classId} " +
        "is also what the student join-by-code flow depends on.",
      err
    );
  }

  await runTransaction(database, async (tx) => {
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

    tx.set(doc(database, "schools", schoolId, "classes", classRef.id, "members", teacherId), {
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

  // FIRST, and not optional: joining a class means joining that class's
  // school. Nothing in the student flow did this — teachers get school
  // membership from their join-by-code step and parents get it at link
  // time, but a student joining by CLASS code was only ever written into
  // schools/{id}/classes/{id}/members, never schools/{id}/members.
  //
  // Almost every school-scoped rule in firestore.rules is
  // `isSchoolMember(schoolId)`, so that omission silently denied the
  // student's entire app: attendance, timetable, assignments,
  // announcements, documents, fee structures and RAG knowledge chunks all
  // returned permission-denied. The screens were built correctly and
  // simply had nothing they were allowed to read — every student
  // dashboard rendered as empty or errored out.
  //
  // Idempotent, and safe against the self-assigned-admin hole the members
  // create rule guards: the role written here is always "student".
  await addSchoolMember(schoolId, studentId, "student");

  const memberRef = doc(db, "schools", schoolId, "classes", classId, "members", studentId);

  // Same reasoning as addSchoolMember's existence check in
  // school-service.ts: this read is an idempotency optimisation, and a
  // permission-denied here IS the "not a member yet" answer, not a
  // failure. Letting it throw would block exactly the students who need
  // to join.
  try {
    const existing = await getDoc(memberRef);
    if (existing.exists()) return { alreadyJoined: true };
  } catch (err) {
    if ((err as { code?: string })?.code !== "permission-denied") throw err;
  }

  await setDoc(memberRef, {
    userId: studentId,
    classId,
    schoolId,
    role: "student",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // The membership above is what actually enrols the student; this is a
  // denormalized display counter. Ordering matters and so does the catch:
  // if this write is rejected (an older firestore.rules deployment gates
  // class updates on isClassTeacher/isSchoolAdmin only), the student IS
  // enrolled, and throwing here would surface as "We couldn't save your
  // profile" on a setup step that had already fully succeeded — stranding
  // them mid-onboarding over a counter.
  try {
    await updateDoc(doc(db, "schools", schoolId, "classes", classId), {
      studentCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Joined class but couldn't update studentCount", err);
  }

  return { alreadyJoined: false };
}

export async function getClassesForSchool(schoolId: string): Promise<ClassEntity[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "schools", schoolId, "classes"));
  return snap.docs.map((d) => d.data() as ClassEntity);
}

/**
 * Live view of the same collection `getClassesForSchool` reads once.
 * Additive — the one-shot version above is unchanged and still used
 * everywhere it was. See subscribeToSchoolMembers for the rationale.
 */
export function subscribeToClassesForSchool(
  schoolId: string,
  onChange: (classes: ClassEntity[]) => void,
  onError?: (err: Error) => void
): import("firebase/firestore").Unsubscribe {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, "schools", schoolId, "classes"),
    (snap) => onChange(snap.docs.map((d) => d.data() as ClassEntity)),
    (err) => onError?.(err)
  );
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
