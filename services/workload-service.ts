// ============================================================
// Staff workload / resource allocation — Firestore wiring.
//
// The analysis itself is pure and lives in lib/workload.ts (unit
// tested, no network). This module's only job is to fetch the inputs
// and inject the real conflict detector, so the recommendations an
// admin sees are verified by exactly the same engine the timetable
// screen validates against.
// ============================================================
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { findConflicts } from "@/lib/timetable-conflicts";
import {
  computeTeacherLoads,
  analyseWorkload,
  suggestReallocations,
  findCoverOptions,
  type WorkloadAnalysis,
  type ReallocationSuggestion,
} from "@/lib/workload";
import type { TimetableSlot } from "@/types";

type SlotWithId = TimetableSlot & { id: string };

async function loadSlots(schoolId: string): Promise<SlotWithId[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "schools", schoolId, "timetable"));
  return snap.docs.map((d) => d.data() as SlotWithId);
}

export interface WorkloadReport {
  analysis: WorkloadAnalysis;
  suggestions: ReallocationSuggestion[];
}

/**
 * Who is overloaded, and what specific reassignment would help.
 * `teacherIds` comes from the caller (the school's member list) so
 * teachers with an empty timetable are still counted — they are the
 * ones a rebalance most wants to find.
 */
export async function getWorkloadReport(
  schoolId: string,
  teacherIds: string[],
  limit = 3
): Promise<WorkloadReport> {
  if (teacherIds.length === 0) {
    return {
      analysis: { loads: [], meanPeriods: 0, spread: 0, overloaded: [], underloaded: [] },
      suggestions: [],
    };
  }

  const slots = await loadSlots(schoolId);
  const analysis = analyseWorkload(computeTeacherLoads(slots, teacherIds));
  return {
    analysis,
    suggestions: suggestReallocations(slots, analysis, findConflicts, limit),
  };
}

/** Cover planning: who is free for each of an absent teacher's periods. */
export async function getCoverOptions(
  schoolId: string,
  absentTeacherId: string,
  day: string,
  teacherIds: string[]
) {
  const slots = await loadSlots(schoolId);
  return findCoverOptions(absentTeacherId, day, slots, teacherIds, findConflicts);
}
