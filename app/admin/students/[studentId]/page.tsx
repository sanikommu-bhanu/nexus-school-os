"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getStudentProfile } from "@/services/student-service";
import { getUserProfiles } from "@/services/user-service";
import { getClassById } from "@/services/class-service";
import { getAttendanceForStudent, summarizeAttendance } from "@/services/attendance-service";
import type { ClassEntity, StudentProfile, UserProfile } from "@/types";

export default function AdminStudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const { profile } = useAuthUser();
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [cls, setCls] = useState<ClassEntity | null>(null);
  const [attendance, setAttendance] = useState<ReturnType<typeof summarizeAttendance> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.schoolId || !studentId) return;
    (async () => {
      const s = await getStudentProfile(studentId);
      if (!s) { setLoading(false); return; }
      const [u, c, records] = await Promise.all([
        getUserProfiles([studentId]),
        getClassById(profile.schoolId!, s.classId),
        getAttendanceForStudent(profile.schoolId!, studentId),
      ]);
      setStudent(s);
      setUser(u.get(studentId) ?? null);
      setCls(c);
      setAttendance(summarizeAttendance(records));
      setLoading(false);
    })().catch((err) => {
      // A rejected read used to escape unhandled, leaving
      // `loading` true forever: the screen showed its spinner
      // permanently with the real reason only in the console.
      setLoadError(err instanceof Error ? err.message : "Something went wrong loading this screen.");
      setLoading(false);
    });
  }, [profile?.schoolId, studentId]);

  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <PageHeader title="Student Profile" />
        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : !student || !user ? (
          <EmptyState title="Student not found" />
        ) : (
          <>
            <div className="flex flex-col items-center py-4 text-center">
              <Avatar name={user.fullName} src={user.photoURL} size="xl" />
              <h2 className="mt-3 text-lg font-bold text-ink">{user.fullName}</h2>
              <p className="text-sm text-ink-muted">{cls ? `${cls.name} · Roll ${student.rollNumber ?? "—"}` : ""}</p>
            </div>

            <GlassSurface rounded="2xl" className="flex divide-x divide-white/8" padded={false}>
              <Stat label="Attendance" value={attendance && attendance.total > 0 ? `${attendance.percentPresent}%` : "—"} />
              <Stat label="Present" value={attendance?.present ?? 0} />
              <Stat label="Absent" value={attendance?.absent ?? 0} />
            </GlassSurface>

            <GlassSurface rounded="2xl" className="mt-5 flex flex-col divide-y divide-white/8" padded={false}>
              <Row label="Class" value={cls?.name ?? "—"} />
              <Row label="Date of Birth" value={student.dateOfBirth ?? "—"} />
              <Row label="Gender" value={student.gender ?? "—"} />
              <Row label="Email" value={user.email ?? "—"} />
            </GlassSurface>
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 flex-1 px-3 py-4 text-center">
      <p className="text-lg font-bold text-ink">{value}</p>
      <p className="text-[11px] text-ink-faint">{label}</p>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}
