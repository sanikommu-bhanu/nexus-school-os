"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { MessagesBell } from "@/components/shell/MessagesBell";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { SectionHeader } from "@/components/ui/MetricCard";
import { ListRow, InsightCard } from "@/components/ui/ListRow";
import { LoadingState, EmptyState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getClassesForTeacher } from "@/services/class-service";
import { getTimetableForTeacher, groupByDay } from "@/services/timetable-service";
import { getAttendanceForClassRange, todayISO } from "@/services/attendance-service";
import type { ClassEntity, TimetableSlot } from "@/types";
import { CheckCircle2, ClipboardCheck, CalendarClock } from "lucide-react";

function todayCode() {
  return new Date().toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2).toUpperCase();
}

export default function TeacherPage() {
  const { profile } = useAuthUser();
  const [classes, setClasses] = useState<ClassEntity[]>([]);
  const [todaySlots, setTodaySlots] = useState<TimetableSlot[]>([]);
  const [pendingAttendance, setPendingAttendance] = useState<ClassEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.schoolId) return;
    (async () => {
      const [c, slots] = await Promise.all([
        getClassesForTeacher(profile.schoolId!, profile.id),
        getTimetableForTeacher(profile.schoolId!, profile.id),
      ]);
      setClasses(c);
      const grouped = groupByDay(slots);
      setTodaySlots(grouped[todayCode() as keyof typeof grouped] ?? []);

      const today = todayISO();
      const pending: ClassEntity[] = [];
      for (const cls of c) {
        const records = await getAttendanceForClassRange(profile.schoolId!, cls.id, today);
        if (!records.some((r) => r.date === today)) pending.push(cls);
      }
      setPendingAttendance(pending);
      setLoading(false);
    })();
  }, [profile?.schoolId, profile?.id]);

  return (
    <AuthGuard allowRoles={["teacher"]}>
      <AppShell role="teacher">
        <div className="flex items-center justify-between pb-6 pt-8">
          <div>
            <p className="text-sm text-ink-muted">Good morning,</p>
            <h1 className="text-xl font-bold text-ink">{profile?.fullName ?? "Teacher"} 👋</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <NotificationBell schoolId={profile?.schoolId} uid={profile?.id} role="teacher" />
            <MessagesBell schoolId={profile?.schoolId} uid={profile?.id} role="teacher" />
            <Avatar name={profile?.fullName ?? "Teacher"} src={profile?.photoURL} size="lg" />
          </div>
        </div>

        {loading ? (
          <LoadingState message="Loading your day…" />
        ) : (
          <>
            <SectionHeader title="Today's Classes" />
            {todaySlots.length === 0 ? (
              <EmptyState icon={<CalendarClock className="h-5.5 w-5.5" />} title="No classes scheduled today" />
            ) : (
              <div className="flex flex-col divide-y divide-white/6">
                {todaySlots.map((s) => (
                  <ListRow
                    key={s.id}
                    href={`/teacher/classes/${s.classId}`}
                    title={s.subject}
                    subtitle={classes.find((c) => c.id === s.classId)?.name}
                    trailing={<span className="text-xs font-semibold text-ink-muted">{s.startTime}</span>}
                  />
                ))}
              </div>
            )}

            <SectionHeader title="My Classes" />
            {classes.length === 0 ? (
              <EmptyState title="No classes yet" message="Create a class to get started." />
            ) : (
              <div className="flex flex-col divide-y divide-white/6">
                {classes.map((c) => (
                  <ListRow key={c.id} href={`/teacher/classes/${c.id}`} title={c.name} subtitle={`${c.subject} · ${c.studentCount} students`} />
                ))}
              </div>
            )}

            <SectionHeader title="Today's Tasks" />
            {pendingAttendance.length === 0 ? (
              <InsightCard icon={<CheckCircle2 className="h-4.5 w-4.5" />} title="Attendance complete" message="All your classes are marked for today." tone="success" />
            ) : (
              <div className="flex flex-col gap-2.5">
                {pendingAttendance.map((c) => (
                  <InsightCard
                    key={c.id}
                    href={`/teacher/classes/${c.id}/attendance`}
                    icon={<ClipboardCheck className="h-4.5 w-4.5" />}
                    title="Attendance pending"
                    message={`${c.name} hasn't been marked for today yet.`}
                    tone="warning"
                  />
                ))}
              </div>
            )}
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}
