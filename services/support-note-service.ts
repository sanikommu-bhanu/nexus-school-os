// ============================================================
// Support note service — schools/{schoolId}/supportNotes/{id}
//
// A lightweight, teacher/admin-only record created exclusively
// through the AI "Create support note" proposed action (Part 5/6).
// Never shown to the student or parent — internal staff context only,
// e.g. "Flagged after 3 missed assignments + declining attendance —
// checking in with student this week."
// ============================================================
import { db } from "@/lib/firebase";
import { doc, setDoc, collection, query, where, orderBy, limit, getDocs, serverTimestamp } from "firebase/firestore";
import { MAX_LEDGER } from "@/lib/query-bounds";

export interface SupportNote {
  id: string;
  schoolId: string;
  studentId: string;
  authorId: string;
  note: string;
  createdAt: string;
}

export async function createSupportNote(schoolId: string, studentId: string, authorId: string, note: string): Promise<SupportNote> {
  if (!db) throw new Error("Firebase isn't configured.");
  const trimmed = note.trim();
  if (!trimmed) throw new Error("Note can't be empty.");

  const ref = doc(collection(db, "schools", schoolId, "supportNotes"));
  const record: SupportNote = {
    id: ref.id,
    schoolId,
    studentId,
    authorId,
    note: trimmed,
    createdAt: new Date().toISOString(),
  };
  await setDoc(ref, { ...record, createdAt: serverTimestamp() });
  return record;
}

/**
 * Staff-facing read of a student's notes, newest first.
 *
 * Bounded like every other ledger read in the app (see lib/query-bounds):
 * supportNotes is append-only and grows for the life of a student, so an
 * unbounded read here is the exact pattern query-bounds exists to prevent.
 * firestore.rules already restricts this to admins and teachers — a
 * student or parent hitting it gets nothing, not a filtered list.
 */
export async function getSupportNotesForStudent(schoolId: string, studentId: string): Promise<SupportNote[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(
      collection(db, "schools", schoolId, "supportNotes"),
      where("studentId", "==", studentId),
      orderBy("createdAt", "desc"),
      limit(MAX_LEDGER)
    )
  );
  return snap.docs.map((d) => d.data() as SupportNote);
}
