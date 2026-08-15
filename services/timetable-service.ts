// ============================================================
// Timetable service — schools/{schoolId}/timetable/{slotId}
// Part 14. One shared collection powers Admin's school view,
// Teacher's schedule, Student's schedule, Parent's child schedule —
// each just filters the same source of truth differently.
// ============================================================
import { db } from "@/lib/firebase";
import { doc, setDoc, collection, query, where, getDocs, serverTimestamp, deleteDoc } from "firebase/firestore";
import type { TimetableSlot, Weekday } from "@/types";

export async function createTimetableSlot(
  schoolId: string,
  data: Pick<TimetableSlot, "classId" | "teacherId" | "subject" | "day" | "period" | "startTime" | "endTime" | "room">
): Promise<{ slot: TimetableSlot; conflicts: string[] }> {
  if (!db) throw new Error("Firebase isn't configured.");

  const conflicts = await detectConflicts(schoolId, data);

  const ref = doc(collection(db, "schools", schoolId, "timetable"));
  const slot: TimetableSlot = {
    id: ref.id,
    schoolId,
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(ref, { ...slot, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return { slot, conflicts };
}

export async function deleteTimetableSlot(schoolId: string, slotId: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, "schools", schoolId, "timetable", slotId));
}

export async function getSchoolTimetable(schoolId: string): Promise<TimetableSlot[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "schools", schoolId, "timetable"));
  return snap.docs.map((d) => d.data() as TimetableSlot);
}

export async function getTimetableForClass(schoolId: string, classId: string): Promise<TimetableSlot[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, "schools", schoolId, "timetable"), where("classId", "==", classId))
  );
  return snap.docs.map((d) => d.data() as TimetableSlot);
}

export async function getTimetableForTeacher(schoolId: string, teacherId: string): Promise<TimetableSlot[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, "schools", schoolId, "timetable"), where("teacherId", "==", teacherId))
  );
  return snap.docs.map((d) => d.data() as TimetableSlot);
}

/**
 * Conflict detection (Part 14): flags the three obvious clashes —
 * teacher double-booked, class double-booked, room double-booked.
 *
 * Fetches the whole day (not day+period) because overlapping slots do
 * not have to share a period number: 09:00-10:00 and 09:30-10:15 are
 * different periods but the same teacher cannot teach both. The
 * comparison itself lives in lib/timetable-conflicts.ts so it is unit
 * testable without Firestore. A single day's slots is a small read.
 */
export async function detectConflicts(
  schoolId: string,
  candidate: Pick<TimetableSlot, "classId" | "teacherId" | "day" | "period" | "room" | "startTime" | "endTime">,
  excludeSlotId?: string
): Promise<string[]> {
  if (!db) return [];
  const daySlots = await getDocs(
    query(collection(db, "schools", schoolId, "timetable"), where("day", "==", candidate.day))
  );
  return findConflicts(
    candidate as SlotLike,
    daySlots.docs.map((d) => d.data() as TimetableSlot),
    excludeSlotId
  );
}

export function groupByDay(slots: TimetableSlot[]): Record<Weekday, TimetableSlot[]> {
  const grouped = {} as Record<Weekday, TimetableSlot[]>;
  for (const slot of slots) {
    if (!grouped[slot.day]) grouped[slot.day] = [];
    grouped[slot.day].push(slot);
  }
  Object.values(grouped).forEach((arr) => arr.sort((a, b) => a.period - b.period));
  return grouped;
}
