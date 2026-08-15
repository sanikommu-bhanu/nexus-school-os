// ============================================================
// Attendance service — schools/{schoolId}/attendance/{recordId}
//
// Scalable model: ONE record per student/class/day, keyed by a
// deterministic id so re-saving the same day edits in place instead
// of duplicating (Part 9/10). Every role reads the *same* records —
// there is no per-role copy — authorization is handled entirely by
// firestore.rules, not by which collection is queried.
// ============================================================
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  orderBy,
  limit as fbLimit,
  Unsubscribe,
} from "firebase/firestore";
import { createNotification } from "@/services/notification-service";
import type { AttendanceRecord, AttendanceStatus } from "@/types";

function recordId(classId: string, studentId: string, date: string) {
  return `${classId}_${studentId}_${date}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Bulk-save one class's attendance for one day. Idempotent per student. */
export async function saveAttendance(
  schoolId: string,
  classId: string,
  date: string,
  markedBy: string,
  entries: { studentId: string; status: AttendanceStatus }[]
): Promise<void> {
  if (!db) throw new Error("Firebase isn't configured.");
  const batch = writeBatch(db);

  for (const entry of entries) {
    const id = recordId(classId, entry.studentId, date);
    const ref = doc(db, "schools", schoolId, "attendance", id);
    batch.set(
      ref,
      {
        id,
        schoolId,
        classId,
        studentId: entry.studentId,
        date,
        status: entry.status,
        markedBy,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      } as AttendanceRecord,
      { merge: true }
    );
  }

  await batch.commit();

  // Notify students marked absent/late today — Part 18: notifications
  // are generated where appropriate, not for every routine "present".
  const flagged = entries.filter((e) => e.status === "absent" || e.status === "late");
  await Promise.all(
    flagged.map((e) =>
      createNotification(schoolId, e.studentId, {
        type: "attendance",
        title: e.status === "absent" ? "Marked absent today" : "Marked late today",
        message: `Your attendance for ${date} was recorded as ${e.status}.`,
        relatedEntityId: classId,
      }).catch(() => {})
    )
  );
}

export async function getAttendanceForClassDate(
  schoolId: string,
  classId: string,
  date: string
): Promise<AttendanceRecord[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(
      collection(db, "schools", schoolId, "attendance"),
      where("classId", "==", classId),
      where("date", "==", date)
    )
  );
  return snap.docs.map((d) => d.data() as AttendanceRecord);
}

export async function getAttendanceForStudent(
  schoolId: string,
  studentId: string,
  limitCount = 60
): Promise<AttendanceRecord[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(
      collection(db, "schools", schoolId, "attendance"),
      where("studentId", "==", studentId),
      orderBy("date", "desc"),
      fbLimit(limitCount)
    )
  );
  return snap.docs.map((d) => d.data() as AttendanceRecord);
}

export async function getAttendanceForClassRange(
  schoolId: string,
  classId: string,
  sinceDate: string
): Promise<AttendanceRecord[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(
      collection(db, "schools", schoolId, "attendance"),
      where("classId", "==", classId),
      where("date", ">=", sinceDate)
    )
  );
  return snap.docs.map((d) => d.data() as AttendanceRecord);
}

/** Realtime subscription used by dashboards that want live attendance % (Part 29). */
export function subscribeToClassAttendanceToday(
  schoolId: string,
  classId: string,
  onChange: (records: AttendanceRecord[]) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(
    collection(db, "schools", schoolId, "attendance"),
    where("classId", "==", classId),
    where("date", "==", todayISO())
  );
  return onSnapshot(q, (snap) => onChange(snap.docs.map((d) => d.data() as AttendanceRecord)));
}

/**
 * Splits a list of records into a "recent" window and the "prior"
 * window immediately before it, so explainable insight cards can say
 * something concrete ("was 92%, now 78%") instead of a vague trend
 * word — used by Parts 16-21, computed entirely from data callers
 * already have in memory (no extra Firestore reads).
 */
export function compareAttendanceWindows(
  records: AttendanceRecord[],
  windowDays = 7
): { recentPct: number | null; priorPct: number | null; delta: number | null } {
  if (records.length === 0) return { recentPct: null, priorPct: null, delta: null };
  const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  const recentCutoff = new Date(Date.now() - windowDays * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const priorCutoff = new Date(Date.now() - windowDays * 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const recent = sorted.filter((r) => r.date >= recentCutoff);
  const prior = sorted.filter((r) => r.date >= priorCutoff && r.date < recentCutoff);

  const recentPct = recent.length > 0 ? summarizeAttendance(recent).percentPresent : null;
  const priorPct = prior.length > 0 ? summarizeAttendance(prior).percentPresent : null;
  const delta = recentPct !== null && priorPct !== null ? recentPct - priorPct : null;

  return { recentPct, priorPct, delta };
}

export function summarizeAttendance(records: AttendanceRecord[]): {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  percentPresent: number;
} {
  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const late = records.filter((r) => r.status === "late").length;
  const excused = records.filter((r) => r.status === "excused").length;
  const total = records.length;
  const percentPresent = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : 0;
  return { present, absent, late, excused, total, percentPresent };
}
