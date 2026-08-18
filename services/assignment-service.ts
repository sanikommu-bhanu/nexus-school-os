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
  limit,
  serverTimestamp,
  writeBatch,
  orderBy,
} from "firebase/firestore";
import { getClassMembers } from "@/services/class-service";
import { createNotification } from "@/services/notification-service";
import { stripUndefined } from "@/lib/utils";
import { MAX_LEDGER } from "@/lib/query-bounds";
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
    // attachmentURL/attachmentName are absent on most assignments.
    ...stripUndefined(data),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Assignment;
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
    });
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

/**
 * One assignment by id. The class workspace already holds the list, but
 * the grading screen is reachable by direct URL (and by refresh), so it
 * has to be able to resolve an assignment without that list in memory.
 */
export async function getAssignmentById(schoolId: string, assignmentId: string): Promise<Assignment | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "schools", schoolId, "assignments", assignmentId));
  return snap.exists() ? (snap.data() as Assignment) : null;
}

/**
 * The teacher's grading action.
 *
 * `grade` is a free-text string on AssignmentSubmission ("A", "17/20",
 * "Merit") rather than a number, so this neither parses nor validates a
 * scale the school hasn't declared — an empty grade clears the mark and
 * returns the row to its submitted state instead of writing "".
 *
 * firestore.rules already allows this: the submissions `update` rule
 * lets `isClassTeacher(schoolId, resource.data.classId)` write any field,
 * and pins `grade` only on a student's self-update. No rules change was
 * needed to add grading — the field and its permission existed, and only
 * the UI was missing.
 *
 * Identifying fields are restated for the same reason markSubmission
 * restates them: a student who joined after the assignment was created
 * has no seeded row, so this is a create for them, and the rules read
 * classId/studentId off the document to decide ownership.
 */
export async function gradeSubmission(
  schoolId: string,
  assignmentId: string,
  studentId: string,
  classId: string,
  grade: string,
  currentStatus: SubmissionStatus
): Promise<void> {
  if (!db) throw new Error("Firebase isn't configured.");
  const trimmed = grade.trim();
  const subId = `${assignmentId}_${studentId}`;
  await setDoc(
    doc(db, "schools", schoolId, "assignments", assignmentId, "submissions", subId),
    {
      id: subId,
      assignmentId,
      studentId,
      classId,
      // Clearing a grade must not strand the row as "graded" with no
      // grade on it, so the status follows the grade: set it and the row
      // is graded, clear it and it falls back to however it was handed
      // in. A row that was never submitted stays pending.
      status: trimmed
        ? ("graded" as SubmissionStatus)
        : currentStatus === "graded"
        ? ("submitted" as SubmissionStatus)
        : currentStatus,
      grade: trimmed,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getSubmissionsForAssignment(
  schoolId: string,
  assignmentId: string
): Promise<AssignmentSubmission[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, "schools", schoolId, "assignments", assignmentId, "submissions"), limit(MAX_LEDGER))
  );
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
  classId: string,
  status: SubmissionStatus
): Promise<void> {
  if (!db) throw new Error("Firebase isn't configured.");
  const subId = `${assignmentId}_${studentId}`;
  await setDoc(
    doc(db, "schools", schoolId, "assignments", assignmentId, "submissions", subId),
    {
      // The identifying fields are written on EVERY call, not just the
      // seeded-row update path. A student who joined the class after the
      // assignment was created has no seeded row, so this write is a
      // create — and the previous payload (status/submittedAt only)
      // produced a document with no studentId or classId, which the
      // submissions rule reads to decide ownership. Missing fields raise
      // an evaluation error in rules, so that write was denied outright.
      // Re-stating them is a no-op on the update path and correct on the
      // create path.
      id: subId,
      assignmentId,
      studentId,
      classId,
      status,
      submittedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * The student-facing "I've handed this in" action.
 *
 * Derives late-vs-on-time from the assignment's own dueDate rather than
 * trusting a caller-supplied status, so a submission can never be
 * recorded as on-time after the deadline. `grade` is deliberately never
 * written here — firestore.rules pins it unchanged on a student's own
 * update, and this is the path that must not trip that check.
 */
export async function submitAssignment(
  schoolId: string,
  assignment: Pick<Assignment, "id" | "classId" | "dueDate">,
  studentId: string
): Promise<SubmissionStatus> {
  const status: SubmissionStatus = Date.now() > new Date(assignment.dueDate).getTime() ? "late" : "submitted";
  await markSubmission(schoolId, assignment.id, studentId, assignment.classId, status);
  return status;
}

/**
 * Submission tallies for a set of assignments, for the teacher's roster
 * view. Returns real counts read from the seeded rows — an assignment
 * with no submissions collection yet reports 0 submitted, never an
 * invented number.
 */
export async function getSubmissionCounts(
  schoolId: string,
  assignmentIds: string[]
): Promise<Map<string, { submitted: number; total: number }>> {
  const counts = new Map<string, { submitted: number; total: number }>();
  if (!db || assignmentIds.length === 0) return counts;
  await Promise.all(
    assignmentIds.map(async (id) => {
      const subs = await getSubmissionsForAssignment(schoolId, id).catch(() => []);
      counts.set(id, {
        submitted: subs.filter((s) => s.status !== "pending").length,
        total: subs.length,
      });
    })
  );
  return counts;
}
