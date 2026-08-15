// ============================================================
// Parent aggregation helpers — composes existing services into
// the per-child snapshots the Parent dashboard/child switcher need,
// without introducing a duplicate data model (Part 20/21).
// ============================================================
import { getChildrenForParent } from "@/services/parent-link-service";
import { getStudentProfile } from "@/services/student-service";
import { getClassById } from "@/services/class-service";
import { getUserProfiles } from "@/services/user-service";
import { getAttendanceForStudent, summarizeAttendance, compareAttendanceWindows } from "@/services/attendance-service";
import { getAssignmentsForClass } from "@/services/assignment-service";
import { getTimetableForClass, groupByDay } from "@/services/timetable-service";
import type { ClassEntity, Weekday } from "@/types";

export interface ChildSnapshot {
  studentId: string;
  name: string;
  photoURL?: string;
  cls: ClassEntity | null;
  attendancePct: number | null;
  pendingAssignments: number;
  nextClass?: { subject: string; startTime: string };
  /** Recent-vs-prior-week attendance comparison (Part 16-21) — real numbers, computed from the same records already fetched. */
  attendanceTrend: { recentPct: number | null; priorPct: number | null; delta: number | null };
}

function todayCode(): Weekday {
  return (["SU", "MO", "TU", "WE", "TH", "FR", "SA"][new Date().getDay()] as Weekday) ?? "MO";
}

export async function getChildSnapshots(parentId: string): Promise<ChildSnapshot[]> {
  const childIds = await getChildrenForParent(parentId);
  if (childIds.length === 0) return [];

  const users = await getUserProfiles(childIds);

  return Promise.all(
    childIds.map(async (studentId) => {
      const student = await getStudentProfile(studentId);
      if (!student) {
        return {
          studentId,
          name: users.get(studentId)?.fullName ?? "Child",
          cls: null,
          attendancePct: null,
          pendingAssignments: 0,
          attendanceTrend: { recentPct: null, priorPct: null, delta: null },
        };
      }
      const [cls, records, assignments, timetable] = await Promise.all([
        getClassById(student.schoolId, student.classId),
        getAttendanceForStudent(student.schoolId, studentId),
        getAssignmentsForClass(student.schoolId, student.classId),
        getTimetableForClass(student.schoolId, student.classId),
      ]);
      const pending = assignments.filter((a) => new Date(a.dueDate).getTime() >= Date.now()).length;
      const grouped = groupByDay(timetable);
      const today = (grouped[todayCode()] ?? []).sort((a, b) => a.period - b.period);
      const next = today.find((s) => s.startTime >= new Date().toTimeString().slice(0, 5)) ?? today[0];

      return {
        studentId,
        name: users.get(studentId)?.fullName ?? "Child",
        photoURL: users.get(studentId)?.photoURL,
        cls,
        attendancePct: records.length > 0 ? summarizeAttendance(records).percentPresent : null,
        pendingAssignments: pending,
        nextClass: next ? { subject: next.subject, startTime: next.startTime } : undefined,
        attendanceTrend: compareAttendanceWindows(records),
      };
    })
  );
}
