// ============================================================
// Parent-student link service — parentStudentLinks/{linkId}
// and parents/{userId}. The parent-child relationship is the
// final edge in School → Class → Teacher → Student → Parent.
// ============================================================
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import { updateUserProfile } from "@/services/user-service";
import { addSchoolMember } from "@/services/school-service";
import { getStudentProfile } from "@/services/student-service";
import type { ParentStudentLink } from "@/types";

export interface ChildPreview {
  studentId: string;
  name: string;
  schoolId: string;
  classId: string;
  schoolName: string;
  className: string;
}

/**
 * Resolves a parent-link code to a preview of the child, without
 * creating the link yet — used to show the confirmation screen
 * ("Connect to Aarav Sharma, Class 10-A?") before committing.
 *
 * Looks up a dedicated `parentLinkPreviews/{code}` document by its
 * exact ID rather than querying the sensitive `students`/`users`
 * collections by field — those collections carry DOB/gender/email/
 * phone and are (correctly) not broadly readable. This collection
 * only allows `get` (never `list`) in firestore.rules, so it can't be
 * enumerated — knowing the code is what authorizes the read, same
 * trust model as a school/class join code.
 */
export async function resolveParentLinkCode(code: string): Promise<ChildPreview | null> {
  if (!db) return null;
  const normalized = code.trim().toUpperCase();

  const snap = await getDoc(doc(db, "parentLinkPreviews", normalized));
  if (!snap.exists()) return null;
  const data = snap.data() as {
    studentId: string;
    name: string;
    schoolId: string;
    classId: string;
    schoolName: string;
    className: string;
  };

  return {
    studentId: data.studentId,
    name: data.name || "Student",
    schoolId: data.schoolId,
    classId: data.classId,
    schoolName: data.schoolName,
    className: data.className,
  };
}

export async function linkParentToStudent(
  parentId: string,
  studentId: string,
  schoolId: string,
  relationship: string
): Promise<{ alreadyLinked: boolean; linkId: string }> {
  if (!db) throw new Error("Firebase isn't configured.");

  const existing = await getDocs(
    query(
      collection(db, "parentStudentLinks"),
      where("parentId", "==", parentId),
      where("studentId", "==", studentId)
    )
  );
  if (!existing.empty) {
    return { alreadyLinked: true, linkId: existing.docs[0].id };
  }

  const linkRef = doc(collection(db, "parentStudentLinks"));

  await runTransaction(db, async (tx) => {
    tx.set(linkRef, {
      id: linkRef.id,
      parentId,
      studentId,
      relationship,
      verified: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    tx.set(
      doc(db!, "parents", parentId),
      {
        userId: parentId,
        childIds: arrayUnion(studentId),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  // Critical: without this, the parent is never added to
  // schools/{schoolId}/members, and nearly every read in this app
  // (attendance, assignments, timetable, documents, fees, RAG
  // knowledge chunks) is gated on isSchoolMember(schoolId) in
  // firestore.rules. Skipping this step is what made the entire
  // Parent Dashboard silently unreadable against real security rules
  // even though every UI screen for it was already built correctly.
  // Idempotent — addSchoolMember no-ops if the parent already belongs
  // (e.g. linking a second child at the same school).
  await addSchoolMember(schoolId, parentId, "parent");

  // `schoolId` is NOT cosmetic on a parent's profile, and leaving it off
  // is what made the whole Parent experience look built-but-dead:
  //
  //  - app/parent/page.tsx gates announcements, the fee summary, the
  //    messages bell and "Message your child's teacher" on
  //    profile.schoolId — all of them silently no-oped, and the message
  //    button returned before doing anything at all.
  //  - /parent/updates, /parent/fees and every notification subscription
  //    bail on the same check.
  //  - buildAiContext() returns null without it, so the Parent AI screen
  //    only ever rendered "couldn't load your school context".
  //  - firestore.rules reads users/{uid} cross-school via
  //    `resource.data.schoolId is string && isSchoolMember(...)`, so with
  //    the field absent a teacher could not resolve a parent's NAME —
  //    which denies the batched getUserProfiles() query behind the
  //    teacher's message list outright.
  //
  // The membership write above already made this true server-side; this
  // just records it where the client reads it from.
  await updateUserProfile(parentId, { schoolId, onboardingComplete: true });

  return { alreadyLinked: false, linkId: linkRef.id };
}

/**
 * Backfills `schoolId` onto a parent's own users/{uid} document.
 *
 * Accounts linked before that field was written have a valid parent-child
 * link and a valid school membership, but no schoolId on their profile —
 * so every screen listed in linkParentToStudent's note above stays blank
 * for them forever, with nothing in the UI to explain why and no way to
 * fix it short of re-linking. Repairing on load is the only path that
 * doesn't ask those users to redo their setup.
 *
 * Derives the school from the first linked child rather than trusting any
 * client input, re-asserts membership (idempotent), and returns the
 * resolved id so the caller can refresh the profile it already holds.
 * Returns null when there's nothing to repair from — no linked child, or
 * a child whose record can't be read.
 */
export async function ensureParentSchoolId(parentId: string): Promise<string | null> {
  const childIds = await getChildrenForParent(parentId);
  if (childIds.length === 0) return null;

  for (const childId of childIds) {
    const student = await getStudentProfile(childId).catch(() => null);
    if (!student?.schoolId) continue;
    await addSchoolMember(student.schoolId, parentId, "parent");
    await updateUserProfile(parentId, { schoolId: student.schoolId });
    return student.schoolId;
  }
  return null;
}

export async function getChildrenForParent(parentId: string): Promise<string[]> {
  if (!db) return [];
  const snap = await getDoc(doc(db, "parents", parentId));
  return snap.exists() ? (snap.data() as any).childIds ?? [] : [];
}

/**
 * Reverse lookup used by messaging: given a student, who are their
 * verified parents. Powers "Message {student}'s parent" from a
 * teacher's class roster without duplicating the link data anywhere.
 */
export async function getParentsForStudent(studentId: string): Promise<string[]> {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, "parentStudentLinks"), where("studentId", "==", studentId)));
  return snap.docs.map((d) => (d.data() as ParentStudentLink).parentId);
}
