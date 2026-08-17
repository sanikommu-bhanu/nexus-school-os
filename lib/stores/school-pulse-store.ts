"use client";

// ============================================================
// Live school pulse — the reactive store behind the admin dashboard.
//
// WHY THIS EXISTS
// The dashboard used to read members, classes and attendance once, in a
// single useEffect on mount. Anything that happened afterwards — a
// teacher accepting an invite, a class being created, a teacher marking
// today's register — was invisible until the admin manually reloaded.
// For a "command center" whose job is surfacing bottlenecks as they
// appear, stale-until-refresh is the wrong default.
//
// WHAT IS LIVE, AND WHAT IS NOT (a deliberate cost decision)
//   live (onSnapshot)   members, classes, and TODAY's attendance for
//                       each class. These are the figures that change
//                       during a school day and that an admin is
//                       watching.
//   on-change (getDocs) the 14-day trend windows behind the insight
//                       cards. A fortnight's history does not move
//                       second to second, so paying for N live
//                       subscriptions over a 14-day range would be
//                       real money for no observable benefit. It is
//                       recomputed whenever the class list changes.
//
// LIFECYCLE
// `connect()` is reference-counted. React 18 StrictMode mounts effects
// twice in development, and several components may want the pulse at
// once — without refcounting the second mount's cleanup would tear down
// the first mount's live subscriptions and the dashboard would silently
// stop updating.
// ============================================================
import { create } from "zustand";
import { subscribeToSchoolMembers } from "@/services/school-service";
import { subscribeToClassesForSchool } from "@/services/class-service";
import {
  subscribeToClassAttendanceToday,
  getAttendanceForClassRange,
  summarizeAttendance,
  compareAttendanceWindows,
} from "@/services/attendance-service";
import type { AttendanceRecord, ClassEntity, SchoolMember } from "@/types";
import type { Unsubscribe } from "firebase/firestore";

export interface ClassTrend {
  classId: string;
  className: string;
  percent: number;
  trend: { recentPct: number | null; priorPct: number | null; delta: number | null };
}

export interface SchoolPulse {
  students: number;
  teachers: number;
  classes: number;
  attendanceToday: number;
}

interface SchoolPulseState {
  schoolId: string | null;
  /** True until members AND classes have both delivered their first snapshot. */
  loading: boolean;
  error: string | null;

  members: SchoolMember[];
  classes: ClassEntity[];
  /** classId -> today's records, kept live. */
  attendanceToday: Record<string, AttendanceRecord[]>;
  trends: ClassTrend[];

  connect: (schoolId: string) => void;
  release: () => void;
}

// ---- module-scope subscription bookkeeping (not React state) ----
let refCount = 0;
let activeSchoolId: string | null = null;
let rootUnsubs: Unsubscribe[] = [];
const attendanceUnsubs = new Map<string, Unsubscribe>();
/** Guards against a slow trend fetch landing after a disconnect/school switch. */
let trendToken = 0;

let seenMembers = false;
let seenClasses = false;

function teardown() {
  rootUnsubs.forEach((u) => u());
  rootUnsubs = [];
  attendanceUnsubs.forEach((u) => u());
  attendanceUnsubs.clear();
  activeSchoolId = null;
  seenMembers = false;
  seenClasses = false;
  trendToken += 1;
}

export const useSchoolPulseStore = create<SchoolPulseState>((set, get) => ({
  schoolId: null,
  loading: true,
  error: null,
  members: [],
  classes: [],
  attendanceToday: {},
  trends: [],

  connect: (schoolId: string) => {
    // Same school, already streaming — just take a reference.
    if (activeSchoolId === schoolId) {
      refCount += 1;
      return;
    }
    // Different school (an admin switching context): drop the old streams.
    if (activeSchoolId) teardown();

    refCount += 1;
    activeSchoolId = schoolId;
    const myToken = ++trendToken;

    set({
      schoolId,
      loading: true,
      error: null,
      members: [],
      classes: [],
      attendanceToday: {},
      trends: [],
    });

    const fail = (err: Error) =>
      set({ loading: false, error: err.message || "Couldn't load your school's pulse." });

    rootUnsubs.push(
      subscribeToSchoolMembers(
        schoolId,
        (members) => {
          seenMembers = true;
          set({ members, loading: !(seenMembers && seenClasses) });
        },
        fail
      )
    );

    rootUnsubs.push(
      subscribeToClassesForSchool(
        schoolId,
        (classes) => {
          seenClasses = true;
          set({ classes, loading: !(seenMembers && seenClasses) });

          // Reconcile per-class attendance streams against the new list:
          // open one for each new class, close any whose class is gone.
          const wanted = new Set(classes.map((c) => c.id));

          attendanceUnsubs.forEach((unsub, classId) => {
            if (!wanted.has(classId)) {
              unsub();
              attendanceUnsubs.delete(classId);
              const next = { ...get().attendanceToday };
              delete next[classId];
              set({ attendanceToday: next });
            }
          });

          classes.forEach((c) => {
            if (attendanceUnsubs.has(c.id)) return;
            attendanceUnsubs.set(
              c.id,
              subscribeToClassAttendanceToday(schoolId, c.id, (records) => {
                set({ attendanceToday: { ...get().attendanceToday, [c.id]: records } });
              })
            );
          });

          void refreshTrends(schoolId, classes, myToken, set);
        },
        fail
      )
    );
  },

  release: () => {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) teardown();
  },
}));

/**
 * Recomputes the 14-day trend windows behind the insight cards.
 * `token` is compared on completion so a fetch issued before a school
 * switch or teardown can never write its result into the new context.
 */
async function refreshTrends(
  schoolId: string,
  classes: ClassEntity[],
  token: number,
  set: (partial: Partial<SchoolPulseState>) => void
) {
  if (classes.length === 0) {
    if (token === trendToken) set({ trends: [] });
    return;
  }

  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  try {
    const perClass = await Promise.all(
      classes.map(async (c) => {
        const records = await getAttendanceForClassRange(schoolId, c.id, since);
        return { cls: c, week: summarizeAttendance(records), trend: compareAttendanceWindows(records) };
      })
    );

    if (token !== trendToken) return; // stale — a newer context won

    set({
      trends: perClass
        .filter((p) => {
          const pct = p.trend.recentPct ?? p.week.percentPresent;
          return pct > 0 && pct < 85 && p.week.total > 0;
        })
        .map((p) => ({
          classId: p.cls.id,
          className: p.cls.name,
          percent: p.trend.recentPct ?? p.week.percentPresent,
          trend: p.trend,
        }))
        .sort((a, b) => a.percent - b.percent)
        .slice(0, 3),
    });
  } catch {
    // A failed trend fetch must not blank the dashboard — the live
    // headline figures are still perfectly valid without it.
  }
}

/** Just the slices `derivePulse` reads — so callers can pass a subset. */
export interface PulseInputs {
  members: SchoolMember[];
  classes: ClassEntity[];
  attendanceToday: Record<string, AttendanceRecord[]>;
}

/**
 * Derives the four headline figures. Kept as a plain function of state
 * so the arithmetic stays identical to what the dashboard computed
 * before (present + late*0.5, weighted across every class), and stays
 * testable without React.
 */
export function derivePulse(state: PulseInputs): SchoolPulse {
  const todayRecords = Object.values(state.attendanceToday);
  const todayTotal = todayRecords.reduce((acc, recs) => acc + recs.length, 0);
  const todayPresent = todayRecords.reduce((acc, recs) => {
    const s = summarizeAttendance(recs);
    return acc + s.present + s.late * 0.5;
  }, 0);

  return {
    students: state.members.filter((m) => m.role === "student").length,
    teachers: state.members.filter((m) => m.role === "teacher").length,
    classes: state.classes.length,
    attendanceToday: todayTotal > 0 ? Math.round((todayPresent / todayTotal) * 100) : 0,
  };
}
