"use client";

import { useEffect, useMemo } from "react";
import {
  useSchoolPulseStore,
  derivePulse,
  type ClassTrend,
  type SchoolPulse,
} from "@/lib/stores/school-pulse-store";

export interface SchoolPulseView {
  pulse: SchoolPulse | null;
  trends: ClassTrend[];
  /** Active teacher user-ids, straight from the live member list. */
  teacherIds: string[];
  loading: boolean;
  error: string | null;
}

/**
 * Subscribes the calling component to the school's live pulse for as
 * long as it is mounted.
 *
 * Mounting this in several components at once is safe and cheap: the
 * store reference-counts, so they share one set of Firestore listeners
 * and the last unmount tears them down.
 *
 * `pulse` is null only before the first snapshot arrives, so callers can
 * keep the exact loading / error / ready branches they already had.
 */
export function useSchoolPulse(schoolId: string | null | undefined): SchoolPulseView {
  const connect = useSchoolPulseStore((s) => s.connect);
  const release = useSchoolPulseStore((s) => s.release);

  const loading = useSchoolPulseStore((s) => s.loading);
  const error = useSchoolPulseStore((s) => s.error);
  const trends = useSchoolPulseStore((s) => s.trends);

  // Select the raw slices (stable references straight out of the store)
  // and derive here. Returning a freshly-built object from a zustand
  // selector would hand React a new snapshot identity on every call,
  // which is exactly the shape that trips the "getSnapshot should be
  // cached" warning — deriving in useMemo sidesteps it entirely.
  const members = useSchoolPulseStore((s) => s.members);
  const classes = useSchoolPulseStore((s) => s.classes);
  const attendanceToday = useSchoolPulseStore((s) => s.attendanceToday);
  const totals = useSchoolPulseStore((s) => s.totals);

  const pulse = useMemo(
    () => (loading ? null : derivePulse({ members, classes, attendanceToday, totals })),
    [loading, members, classes, attendanceToday, totals]
  );

  // Removed members must not linger in staffing maths, hence the
  // status filter — `role === "teacher"` alone would keep counting
  // someone who has left the school.
  const teacherIds = useMemo(
    () => members.filter((m) => m.role === "teacher" && m.status === "active").map((m) => m.userId),
    [members]
  );

  useEffect(() => {
    if (!schoolId) return;
    connect(schoolId);
    return () => release();
  }, [schoolId, connect, release]);

  return { pulse, trends, teacherIds, loading: schoolId ? loading : true, error };
}
