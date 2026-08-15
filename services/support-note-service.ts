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
import { doc, setDoc, collection, query, where, orderBy, getDocs, serverTimestamp } from "firebase/firestore";

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

export async function getSupportNotesForStudent(schoolId: string, studentId: string): Promise<SupportNote[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, "schools", schoolId, "supportNotes"), where("studentId", "==", studentId), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => d.data() as SupportNote);
}
