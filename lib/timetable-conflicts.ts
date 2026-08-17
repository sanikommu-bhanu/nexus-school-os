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

// ============================================================
// Conflict RESOLUTION.
//
// Detection alone tells an admin "no" and leaves them to hunt for a
// gap by hand — which is exactly the manual, siloed scheduling this
// project exists to remove. The search below answers the useful
// question instead: "given everything already booked, where CAN this
// go?"
//
// Pure, like the rest of this file: the caller supplies the desired
// slot and every slot already on the timetable, and gets back ranked
// alternatives. No Firestore, no network, unit-testable directly.
// ============================================================

export interface SlotSuggestion {
  day: string;
  period: number;
  startTime: string;
  endTime: string;
  /** Lower is better. 0 = same day and same period length, just moved. */
  cost: number;
  /** Why this was ranked where it was, for display next to the option. */
  reason: string;
}

export interface SuggestOptions {
  /** Days to consider, in preference order (e.g. WEEKDAYS). */
  days: string[];
  /** Period numbers to consider, in order (e.g. [1..8]). */
  periods: number[];
  /**
   * Wall-clock start time for each period number, e.g.
   * { 1: "09:00", 2: "10:00" }. Periods missing from this map are
   * skipped — a suggestion with no real time would not be actionable.
   */
  periodStartTimes: Record<number, string>;
  /** Slot length in minutes. Defaults to the candidate's own length. */
  durationMinutes?: number;
  /** How many suggestions to return. */
  limit?: number;
}

function toHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The candidate's own length in minutes, when both times parse. */
export function slotDuration(slot: SlotLike): number | null {
  const start = toMinutes(slot.startTime);
  const end = toMinutes(slot.endTime);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

/**
 * Finds placements for `candidate` that clash with nothing.
 *
 * Strategy: enumerate the (day x period) grid, reject any cell that
 * `findConflicts` rejects — so a suggestion can never contradict the
 * detector — then rank what survives:
 *
 *   +0   same day as originally wanted (keeps the teacher's routine)
 *   +10  a different day
 *   +n   distance in period numbers from the original slot
 *
 * so the first result is the smallest change that actually works. This
 * is a deliberate greedy search over a small fixed grid (a week x ~8
 * periods = tens of cells), not a general CSP solver: it is O(cells x
 * existing slots), runs in microseconds, and is trivial to reason
 * about. A full solver only becomes worthwhile when generating an
 * entire timetable from scratch rather than placing one slot.
 */
export function suggestAlternativeSlots(
  candidate: SlotLike,
  existing: SlotLike[],
  options: SuggestOptions,
  excludeId?: string
): SlotSuggestion[] {
  const { days, periods, periodStartTimes } = options;
  const limit = options.limit ?? 5;
  const duration = options.durationMinutes ?? slotDuration(candidate) ?? 45;

  const suggestions: SlotSuggestion[] = [];

  for (const day of days) {
    for (const period of periods) {
      const startHHMM = periodStartTimes[period];
      if (!startHHMM) continue;

      const startMin = toMinutes(startHHMM);
      if (startMin === null) continue;

      const probe: SlotLike = {
        ...candidate,
        day,
        period,
        startTime: startHHMM,
        endTime: toHHMM(startMin + duration),
      };

      // Skip the placement the caller already has — suggesting the
      // status quo is noise.
      if (day === candidate.day && period === candidate.period) continue;

      if (findConflicts(probe, existing, excludeId).length > 0) continue;

      const sameDay = day === candidate.day;
      const periodDistance = Math.abs(period - candidate.period);

      suggestions.push({
        day,
        period,
        startTime: probe.startTime!,
        endTime: probe.endTime!,
        cost: (sameDay ? 0 : 10) + periodDistance,
        reason: sameDay
          ? `Same day, period ${period}`
          : `${day}, period ${period}`,
      });
    }
  }

  return suggestions.sort((a, b) => a.cost - b.cost).slice(0, limit);
}
