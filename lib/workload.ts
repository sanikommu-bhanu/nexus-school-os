// ============================================================
// Staff workload analysis and resource reallocation — pure logic.
//
// The "Predictive Resource Allocation" idea, done honestly. There is
// no model here and no claim of one: every output is a deterministic
// function of the school's own timetable, so an admin can always be
// shown exactly why a recommendation was made. That is a feature, not
// a limitation — an opaque staffing recommendation nobody can justify
// is not one a head teacher will ever act on.
//
// Three things it answers:
//   1. Who is carrying how much?          computeTeacherLoads
//   2. Is that distribution unfair?       analyseWorkload
//   3. What specific change would fix it? suggestReallocations
//
// (3) is the important one: a reallocation is only offered if moving
// that exact slot to that exact teacher is verified conflict-free by
// the injected checker (the same tested detector the timetable screen
// uses). Recommendations that turn out to be impossible are worse than
// no recommendation at all.
//
// Pure and Firestore-free, like lib/timetable-conflicts.ts, so all of
// it is unit-tested directly.
// ============================================================
// TYPE-ONLY import: erased entirely at compile time, so this module
// pulls in no runtime dependency and stays runnable under Node's native
// type stripping (which resolves specifiers literally and would
// otherwise need a ".ts" extension that the app's bundler resolution
// rejects — see the note in tsconfig.json).
//
// The conflict CHECK is injected rather than imported. That inverts the
// dependency so allocation logic is testable against the real detector
// while staying decoupled from it, and callers cannot forget to supply
// one.
import type { SlotLike } from "./timetable-conflicts";

/** Same shape as `findConflicts` — a message per clash, empty when legal. */
export type ConflictChecker = (
  candidate: SlotLike,
  existing: SlotLike[],
  excludeId?: string
) => string[];

export interface TeacherLoad {
  teacherId: string;
  /** Total scheduled periods across the week. */
  periodsPerWeek: number;
  /** Distinct days the teacher is scheduled on. */
  daysActive: number;
  /** The teacher's heaviest single day, if they teach at all. */
  busiestDay: { day: string; periods: number } | null;
}

export interface WorkloadAnalysis {
  loads: TeacherLoad[];
  meanPeriods: number;
  /** Highest minus lowest weekly load — the headline "is this fair?" number. */
  spread: number;
  overloaded: TeacherLoad[];
  underloaded: TeacherLoad[];
}

export interface ReallocationSuggestion {
  slotId: string;
  /** So callers can deep-link straight to the affected class's timetable. */
  classId: string;
  subject: string;
  day: string;
  period: number;
  fromTeacherId: string;
  toTeacherId: string;
  /** Weekly load of each teacher BEFORE the move, for an honest explanation. */
  fromLoad: number;
  toLoad: number;
  reason: string;
}

/**
 * Weekly load per teacher.
 *
 * `teacherIds` is passed in rather than inferred from the slots so that
 * teachers with an empty timetable still appear — they are precisely
 * the people a rebalance wants to find, and inferring from slots alone
 * would make them invisible.
 */
export function computeTeacherLoads(
  slots: Pick<SlotLike, "teacherId" | "day">[],
  teacherIds: string[]
): TeacherLoad[] {
  return teacherIds.map((teacherId) => {
    const mine = slots.filter((s) => s.teacherId === teacherId);
    const perDay = new Map<string, number>();
    for (const s of mine) perDay.set(s.day, (perDay.get(s.day) ?? 0) + 1);

    let busiestDay: { day: string; periods: number } | null = null;
    perDay.forEach((periods, day) => {
      if (!busiestDay || periods > busiestDay.periods) busiestDay = { day, periods };
    });

    return {
      teacherId,
      periodsPerWeek: mine.length,
      daysActive: perDay.size,
      busiestDay,
    };
  });
}

/**
 * Flags teachers meaningfully above or below the staff average.
 *
 * `tolerance` is in periods, not a percentage: with small staffs a
 * percentage threshold is far too twitchy (one period on a 3-period
 * timetable is a 33% swing). Default 2 means "more than two periods
 * from the mean", which is about a day's difference in most schools.
 */
export function analyseWorkload(loads: TeacherLoad[], tolerance = 2): WorkloadAnalysis {
  if (loads.length === 0) {
    return { loads, meanPeriods: 0, spread: 0, overloaded: [], underloaded: [] };
  }

  const total = loads.reduce((acc, l) => acc + l.periodsPerWeek, 0);
  const meanPeriods = total / loads.length;
  const counts = loads.map((l) => l.periodsPerWeek);
  const spread = Math.max(...counts) - Math.min(...counts);

  return {
    loads: [...loads].sort((a, b) => b.periodsPerWeek - a.periodsPerWeek),
    meanPeriods: Math.round(meanPeriods * 10) / 10,
    spread,
    overloaded: loads
      .filter((l) => l.periodsPerWeek > meanPeriods + tolerance)
      .sort((a, b) => b.periodsPerWeek - a.periodsPerWeek),
    underloaded: loads
      .filter((l) => l.periodsPerWeek < meanPeriods - tolerance)
      .sort((a, b) => a.periodsPerWeek - b.periodsPerWeek),
  };
}

/**
 * Concrete, verified moves that would flatten the distribution.
 *
 * For each overloaded teacher's slots, tries the least-loaded teachers
 * first and keeps a move only if reassigning that slot creates no
 * conflict for the receiving teacher. Running totals are updated as
 * suggestions accumulate, so a single under-loaded teacher is not
 * handed the entire surplus.
 */
export function suggestReallocations(
  slots: (SlotLike & { id: string; subject?: string })[],
  analysis: WorkloadAnalysis,
  hasConflicts: ConflictChecker,
  limit = 3
): ReallocationSuggestion[] {
  const suggestions: ReallocationSuggestion[] = [];
  if (analysis.overloaded.length === 0 || analysis.underloaded.length === 0) return suggestions;

  // Mutable running loads so each accepted move affects the next choice.
  const running = new Map(analysis.loads.map((l) => [l.teacherId, l.periodsPerWeek]));

  for (const over of analysis.overloaded) {
    for (const slot of slots.filter((s) => s.teacherId === over.teacherId)) {
      if (suggestions.length >= limit) return suggestions;

      const candidates = [...analysis.underloaded]
        .map((u) => ({ ...u, current: running.get(u.teacherId) ?? u.periodsPerWeek }))
        .sort((a, b) => a.current - b.current);

      for (const cand of candidates) {
        // Stop if moving would simply invert the imbalance.
        if ((running.get(over.teacherId) ?? 0) - 1 < cand.current + 1) continue;

        const probe: SlotLike = { ...slot, teacherId: cand.teacherId };
        // Exclude the slot itself: it is being MOVED, not duplicated, so
        // it must not be treated as an obstacle to its own reassignment.
        if (hasConflicts(probe, slots, slot.id).length > 0) continue;

        suggestions.push({
          slotId: slot.id,
          classId: slot.classId,
          subject: slot.subject ?? "Lesson",
          day: slot.day,
          period: slot.period,
          fromTeacherId: over.teacherId,
          toTeacherId: cand.teacherId,
          fromLoad: running.get(over.teacherId) ?? over.periodsPerWeek,
          toLoad: cand.current,
          reason: `Frees a period for a teacher on ${running.get(over.teacherId) ?? over.periodsPerWeek}/week and gives it to one on ${cand.current}/week.`,
        });

        running.set(over.teacherId, (running.get(over.teacherId) ?? 1) - 1);
        running.set(cand.teacherId, cand.current + 1);
        break; // this slot is placed; move to the next one
      }
    }
  }

  return suggestions;
}

/**
 * Cover planning: who is free for each of an absent teacher's periods?
 *
 * The question a school actually asks at 8am. Same verification rule —
 * a name is only offered if that teacher has no clash at that time.
 */
export function findCoverOptions(
  absentTeacherId: string,
  day: string,
  slots: (SlotLike & { id: string; subject?: string })[],
  teacherIds: string[],
  hasConflicts: ConflictChecker
): { slotId: string; subject: string; period: number; available: string[] }[] {
  return slots
    .filter((s) => s.teacherId === absentTeacherId && s.day === day)
    .map((slot) => ({
      slotId: slot.id,
      subject: slot.subject ?? "Lesson",
      period: slot.period,
      available: teacherIds.filter(
        (t) =>
          t !== absentTeacherId &&
          hasConflicts({ ...slot, teacherId: t }, slots, slot.id).length === 0
      ),
    }));
}
