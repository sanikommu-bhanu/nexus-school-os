// ============================================================
// Timetable conflict detection — pure logic, no Firestore.
//
// Split out of services/timetable-service.ts so it can be unit-tested
// directly (tests/timetable-conflicts.test.ts) without an emulator or
// network. The service supplies the candidate + the day's existing
// slots; everything decided here is a pure function of those inputs.
//
// The original implementation compared only `day + period` equality,
// which meant it could not see a genuine clash whose periods differ:
//   period 1  09:00-10:00   (Maths, 10-A, Mr Rao)
//   period 2  09:30-10:15   (Physics, 10-A, Mr Rao)
// Same teacher, same class, overlapping wall-clock time, different
// period number — silently allowed. Real overlap is a time-range
// intersection, so that is what is checked here; matching period
// numbers are still treated as a clash even when the times are absent
// or unparseable, so the old behaviour is a subset of the new one.
// ============================================================

export interface SlotLike {
  id?: string;
  classId: string;
  teacherId: string;
  subject?: string;
  day: string;
  period: number;
  startTime?: string;
  endTime?: string;
  room?: string;
}

/** "09:45" -> 585. Returns null for anything not HH:MM. */
export function toMinutes(hhmm: string | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Do two slots occupy overlapping wall-clock time on the same day?
 * Half-open intervals: a slot ending at 10:00 does NOT conflict with
 * one starting at 10:00 (back-to-back periods are the normal case).
 * Falls back to period equality when either time range is missing or
 * malformed, so a partially-filled slot still can't silently collide.
 */
export function slotsOverlap(a: SlotLike, b: SlotLike): boolean {
  if (a.day !== b.day) return false;

  const aStart = toMinutes(a.startTime);
  const aEnd = toMinutes(a.endTime);
  const bStart = toMinutes(b.startTime);
  const bEnd = toMinutes(b.endTime);

  const timesUsable =
    aStart !== null && aEnd !== null && bStart !== null && bEnd !== null && aEnd > aStart && bEnd > bStart;

  if (!timesUsable) return a.period === b.period;
  return aStart! < bEnd! && bStart! < aEnd!;
}

function when(slot: SlotLike): string {
  return slot.startTime && slot.endTime
    ? `${slot.startTime}–${slot.endTime}`
    : `period ${slot.period}`;
}

/**
 * Human-readable conflict messages for a candidate slot against the
 * slots that already exist. `existing` should already be narrowed to
 * the same day; anything else is ignored anyway.
 *
 * `excludeId` skips the slot being edited so updating a slot in place
 * never reports the slot conflicting with itself.
 */
export function findConflicts(
  candidate: SlotLike,
  existing: SlotLike[],
  excludeId?: string
): string[] {
  const conflicts: string[] = [];

  for (const slot of existing) {
    if (excludeId && slot.id === excludeId) continue;
    if (slot.id && candidate.id && slot.id === candidate.id) continue;
    if (!slotsOverlap(candidate, slot)) continue;

    const label = slot.subject ? `${slot.subject} (${when(slot)})` : when(slot);

    if (slot.teacherId === candidate.teacherId) {
      conflicts.push(`Teacher is already scheduled for ${label}.`);
    }
    if (slot.classId === candidate.classId) {
      conflicts.push(`Class already has ${label} scheduled.`);
    }
    if (candidate.room && slot.room && slot.room === candidate.room) {
      conflicts.push(`Room ${slot.room} is already booked for ${label}.`);
    }
  }

  // Two different existing slots can produce the same sentence.
  return Array.from(new Set(conflicts));
}
