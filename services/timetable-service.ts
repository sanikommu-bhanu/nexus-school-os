// ============================================================
// Timetable service — schools/{schoolId}/timetable/{slotId}
// Part 14. One shared collection powers Admin's school view,
// Teacher's schedule, Student's schedule, Parent's child schedule —
// each just filters the same source of truth differently.
// ============================================================
import { db } from "@/lib/firebase";
import { doc, setDoc, collection, query, where, getDocs, limit, serverTimestamp, deleteDoc } from "firebase/firestore";
import {
  findConflicts,
  suggestAlternativeSlots,
  type SlotLike,
  type SlotSuggestion,
} from "@/lib/timetable-conflicts";
import { stripUndefined } from "@/lib/utils";
import { MAX_TIMETABLE } from "@/lib/query-bounds";
import { WEEKDAYS } from "@/types";
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
    // `room` is optional; the admin timetable form works around this at
    // the call site, but the service should not depend on it doing so.
    ...stripUndefined(data),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as TimetableSlot;
  await setDoc(ref, { ...slot, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return { slot, conflicts };
}

export async function deleteTimetableSlot(schoolId: string, slotId: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, "schools", schoolId, "timetable", slotId));
}

/** BOUNDED: a full week across every class. See lib/query-bounds.ts. */
export async function getSchoolTimetable(schoolId: string): Promise<TimetableSlot[]> {
  if (!db) return [];
  const snap = await getDocs(query(collection(db, "schools", schoolId, "timetable"), limit(MAX_TIMETABLE)));
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

/**
 * Default bell schedule used when suggesting alternatives. Kept here
 * rather than in the pure module so the algorithm stays free of any
 * assumption about how a particular school runs its day — a school
 * with a different timetable passes its own map.
 */
export const DEFAULT_PERIOD_START_TIMES: Record<number, string> = {
  1: "09:00",
  2: "10:00",
  3: "11:00",
  4: "12:00",
  5: "13:00",
  6: "14:00",
  7: "15:00",
  8: "16:00",
};

/**
 * Conflict RESOLUTION (the other half of Part 14).
 *
 * `detectConflicts` answers "is this slot legal?". This answers the
 * question an admin actually has next — "then where can it go?" —
 * by searching the whole week rather than just the requested day.
 *
 * Reads every slot for the school once and hands them to the pure
 * search in lib/timetable-conflicts.ts, so ranking stays unit-tested
 * and Firestore-free. Every returned suggestion is guaranteed to pass
 * `findConflicts`, which the test suite asserts directly.
 */
export async function suggestConflictFreeSlots(
  schoolId: string,
  candidate: Pick<TimetableSlot, "classId" | "teacherId" | "day" | "period" | "room" | "startTime" | "endTime">,
  options?: {
    days?: Weekday[];
    periods?: number[];
    periodStartTimes?: Record<number, string>;
    limit?: number;
  },
  excludeSlotId?: string
): Promise<SlotSuggestion[]> {
  if (!db) return [];

  // The whole week, because a resolution may well be on another day —
  // bounded all the same, so one pathological school cannot make this
  // query unbounded.
  const all = await getDocs(query(collection(db, "schools", schoolId, "timetable"), limit(MAX_TIMETABLE)));
  const existing = all.docs.map((d) => d.data() as TimetableSlot);

  return suggestAlternativeSlots(
    candidate as SlotLike,
    existing,
    {
      days: options?.days ?? [...WEEKDAYS],
      periods: options?.periods ?? [1, 2, 3, 4, 5, 6, 7, 8],
      periodStartTimes: options?.periodStartTimes ?? DEFAULT_PERIOD_START_TIMES,
      limit: options?.limit ?? 5,
    },
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
