// ============================================================
// Assignment service — schools/{schoolId}/assignments/{id}
// and schools/{schoolId}/assignments/{id}/submissions/{studentId}
// Part 13. Submission doc is created lazily as "pending" for every
// class member when the assignment is created, so counts are always
// real (never a fabricated "X submitted").
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
  writeBatch,
  orderBy,
} from "firebase/firestore";
import { getClassMembers } from "@/services/class-service";
import { createNotification } from "@/services/notification-service";
import type { Assignment, AssignmentSubmission, SubmissionStatus } from "@/types";

export async function createAssignment(
  schoolId: string,
  teacherId: string,
  data: Pick<Assignment, "classId" | "title" | "description" | "subject" | "dueDate" | "attachmentURL" | "attachmentName">
): Promise<Assignment> {
  if (!db) throw new Error("Firebase isn't configured.");
  const ref = doc(collection(db, "schools", schoolId, "assignments"));
  const assignment: Assignment = {
    id: ref.id,
    schoolId,
    teacherId,
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(ref, { ...assignment, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  // Seed a real "pending" submission row per enrolled student.
  const members = await getClassMembers(schoolId, data.classId);
  const students = members.filter((m) => m.role === "student");
  const batch = writeBatch(db);
  for (const s of students) {
    const subId = `${ref.id}_${s.userId}`;
    batch.set(doc(db, "schools", schoolId, "assignments", ref.id, "submissions", subId), {
      id: subId,
      assignmentId: ref.id,
      studentId: s.userId,
      classId: data.classId,
      status: "pending" as SubmissionStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as AssignmentSubmission);
  }
  await batch.commit();

  await Promise.all(
    students.map((s) =>
      createNotification(schoolId, s.userId, {
        type: "assignment",
        title: "New assignment",
        message: `${data.title} — due ${new Date(data.dueDate).toLocaleDateString()}`,
        relatedEntityId: ref.id,
      }).catch(() => {})
    )
  );

  return assignment;
}

export async function getAssignmentsForClass(schoolId: string, classId: string): Promise<Assignment[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(
      collection(db, "schools", schoolId, "assignments"),
      where("classId", "==", classId),
      orderBy("dueDate", "desc")
    )
  );
  return snap.docs.map((d) => d.data() as Assignment);
}

export async function getAssignmentsForClasses(schoolId: string, classIds: string[]): Promise<Assignment[]> {
  if (!db || classIds.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < classIds.length; i += 10) chunks.push(classIds.slice(i, i + 10));
  const results = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(collection(db!, "schools", schoolId, "assignments"), where("classId", "in", chunk)))
    )
  );
  return results.flatMap((snap) => snap.docs.map((d) => d.data() as Assignment));
}

export async function getSubmissionsForAssignment(
  schoolId: string,
  assignmentId: string
): Promise<AssignmentSubmission[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "schools", schoolId, "assignments", assignmentId, "submissions"));
  return snap.docs.map((d) => d.data() as AssignmentSubmission);
}

export async function getSubmissionsForStudent(
  schoolId: string,
  studentId: string,
  assignmentIds: string[]
): Promise<AssignmentSubmission[]> {
  if (!db || assignmentIds.length === 0) return [];
  const results = await Promise.all(
    assignmentIds.map(async (aid) => {
      const ref = doc(db!, "schools", schoolId, "assignments", aid, "submissions", `${aid}_${studentId}`);
      const snap = await getDoc(ref);
      return snap.exists() ? (snap.data() as AssignmentSubmission) : null;
    })
  );
  return results.filter((r): r is AssignmentSubmission => r !== null);
}

export async function markSubmission(
  schoolId: string,
  assignmentId: string,
  studentId: string,
  status: SubmissionStatus
): Promise<void> {
  if (!db) return;
  const subId = `${assignmentId}_${studentId}`;
  await setDoc(
    doc(db, "schools", schoolId, "assignments", assignmentId, "submissions", subId),
    { status, submittedAt: new Date().toISOString(), updatedAt: serverTimestamp() },
    { merge: true }
  );
}
