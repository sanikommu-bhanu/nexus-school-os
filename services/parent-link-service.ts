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

  await updateUserProfile(parentId, { onboardingComplete: true });

  return { alreadyLinked: false, linkId: linkRef.id };
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
