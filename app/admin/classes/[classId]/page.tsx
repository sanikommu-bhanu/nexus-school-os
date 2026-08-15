"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { ListRow } from "@/components/ui/ListRow";
import { QRDisplay } from "@/components/ui/QRDisplay";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { Avatar } from "@/components/ui/Avatar";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getClassById } from "@/services/class-service";
import { getStudentsForClass } from "@/services/student-service";
import { getUserProfiles } from "@/services/user-service";
import { getAttendanceForClassRange, summarizeAttendance } from "@/services/attendance-service";
import { getAssignmentsForClass } from "@/services/assignment-service";
import type { ClassEntity, UserProfile } from "@/types";
import { Users, FileText, CalendarClock } from "lucide-react";
import Link from "next/link";

export default function AdminClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const { profile } = useAuthUser();
  const [cls, setCls] = useState<ClassEntity | null>(null);
  const [students, setStudents] = useState<{ id: string; user?: UserProfile }[]>([]);
  const [attendancePct, setAttendancePct] = useState<number | null>(null);
  const [assignmentCount, setAssignmentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.schoolId || !classId) return;
    (async () => {
      const c = await getClassById(profile.schoolId!, classId);
      if (!c) { setLoading(false); return; }
      setCls(c);

      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const [roster, records, assignments] = await Promise.all([
        getStudentsForClass(profile.schoolId!, classId),
        getAttendanceForClassRange(profile.schoolId!, classId, since),
        getAssignmentsForClass(profile.schoolId!, classId),
      ]);
      const users = await getUserProfiles(roster.map((s) => s.userId));
      setStudents(roster.map((s) => ({ id: s.userId, user: users.get(s.userId) })));
      setAttendancePct(records.length > 0 ? summarizeAttendance(records).percentPresent : null);
      setAssignmentCount(assignments.length);
      setLoading(false);
    })();
  }, [profile?.schoolId, classId]);

  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <PageHeader title={cls?.name ?? "Class"} subtitle={cls?.subject} />

        {loading ? (
          <LoadingState />
        ) : !cls ? (
          <EmptyState title="Class not found" />
        ) : (
          <>
            <GlassSurface rounded="2xl" className="flex divide-x divide-white/8" padded={false}>
              <Stat label="Students" value={cls.studentCount} />
              <Stat label="Attendance" value={attendancePct !== null ? `${attendancePct}%` : "—"} />
              <Stat label="Assignments" value={assignmentCount} />
            </GlassSurface>

            <div className="mt-6">
              <QRDisplay value={`https://nexus.app/join/class/${cls.code}`} code={cls.code} label="Class Code" size={140} />
            </div>

            <div className="mt-5">
              <Link
                href={`/admin/classes/${classId}/timetable`}
                className="glass-surface flex items-center gap-3 rounded-2xl p-4 active:scale-[0.97] transition-transform"
              >
                <CalendarClock className="h-5 w-5 text-accent-soft" />
                <span className="text-sm font-medium text-ink">Manage Timetable</span>
              </Link>
            </div>

            <div className="mt-7">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Students</p>
              {students.length === 0 ? (
                <EmptyState icon={<Users className="h-5.5 w-5.5" />} title="No students yet" message="Share the class code so students can join." />
              ) : (
                <div className="flex flex-col divide-y divide-white/6">
                  {students.map((s) => (
                    <ListRow
                      key={s.id}
                      href={`/admin/students/${s.id}`}
                      leading={<Avatar name={s.user?.fullName ?? "Student"} src={s.user?.photoURL} size="sm" />}
                      title={s.user?.fullName ?? "Student"}
                    />
                  ))}
                </div>
              )}
            </div>
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
