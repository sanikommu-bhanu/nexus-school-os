"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { MessagesBell } from "@/components/shell/MessagesBell";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { SectionHeader } from "@/components/ui/MetricCard";
import { ListRow, InsightCard } from "@/components/ui/ListRow";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { Badge } from "@/components/ui/Badge";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getStudentProfile, ensureStudentSchoolMembership } from "@/services/student-service";
import { getClassById } from "@/services/class-service";
import { getAttendanceForStudent, summarizeAttendance, compareAttendanceWindows } from "@/services/attendance-service";
import { getAssignmentsForClass } from "@/services/assignment-service";
import { getTimetableForClass, groupByDay } from "@/services/timetable-service";
import { subscribeToNotifications } from "@/services/notification-service";
import { ExplainableInsightCard } from "@/components/ai/ExplainableInsightCard";
import type { Assignment, ClassEntity, NotificationItem, TimetableSlot, Weekday } from "@/types";
import { Sparkles, CalendarClock, BookOpen, IndianRupee, TrendingDown, TrendingUp } from "lucide-react";
import { Stat } from "@/components/ui/Stat";

function todayCode(): Weekday {
  return (["SU", "MO", "TU", "WE", "TH", "FR", "SA"][new Date().getDay()] as Weekday) ?? "MO";
}

export default function StudentPage() {
  const { profile } = useAuthUser();
  const [cls, setCls] = useState<ClassEntity | null>(null);
  const [attendancePct, setAttendancePct] = useState<number | null>(null);
  const [attendanceTrend, setAttendanceTrend] = useState<{ recentPct: number | null; priorPct: number | null; delta: number | null }>({
    recentPct: null,
    priorPct: null,
    delta: null,
  });
  const [todaySlots, setTodaySlots] = useState<TimetableSlot[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.schoolId || !profile.id) return;
    (async () => {
      try {
        // Repairs accounts that joined a class before school membership
        // was part of that flow. Every read below is gated on
        // isSchoolMember in firestore.rules, so this has to happen first
        // or they all come back permission-denied. No-ops (one read, no
        // write) once the membership exists.
        await ensureStudentSchoolMembership(profile.id);

        const student = await getStudentProfile(profile.id);
        if (!student) { setLoading(false); return; }
        const [c, records, slots, a] = await Promise.all([
          getClassById(profile.schoolId!, student.classId),
          getAttendanceForStudent(profile.schoolId!, profile.id),
          getTimetableForClass(profile.schoolId!, student.classId),
          getAssignmentsForClass(profile.schoolId!, student.classId),
        ]);
        setCls(c);
        setAttendancePct(records.length > 0 ? summarizeAttendance(records).percentPresent : null);
        setAttendanceTrend(compareAttendanceWindows(records));
        const grouped = groupByDay(slots);
        setTodaySlots(grouped[todayCode()] ?? []);
        setAssignments(a.filter((x) => new Date(x.dueDate).getTime() >= Date.now()).slice(0, 3));
      } catch (err) {
        // Previously a rejected read left `loading` true forever, so the
        // screen showed a spinner with no explanation — the exact symptom
        // the missing school membership produced.
        setLoadError(err instanceof Error ? err.message : "We couldn't load your dashboard.");
      } finally {
        setLoading(false);
      }
    })();

    const unsub = subscribeToNotifications(profile.schoolId, profile.id, setNotifications);
    return unsub;
  }, [profile?.schoolId, profile?.id]);

  return (
    <AuthGuard allowRoles={["student"]}>
      <AppShell role="student">
        <div className="flex items-center justify-between pb-6 pt-8">
          <div>
            <p className="text-sm text-ink-muted">Good morning,</p>
            <h1 className="text-xl font-bold text-ink">{profile?.fullName ?? "Student"} 👋</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <NotificationBell schoolId={profile?.schoolId} uid={profile?.id} role="student" />
            <MessagesBell schoolId={profile?.schoolId} uid={profile?.id} role="student" />
            <Avatar name={profile?.fullName ?? "Student"} src={profile?.photoURL} size="lg" />
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : (
          <>
            <GlassSurface rounded="2xl" className="flex divide-x divide-white/8" padded={false}>
              <Stat size="lg" label="Class" value={cls?.name ?? "—"} />
              <Stat size="lg" label="Attendance" value={attendancePct !== null ? `${attendancePct}%` : "—"} />
              <Stat size="lg" label="Assignments" value={assignments.length} />
            </GlassSurface>

            <SectionHeader title="Today's Schedule" />
            {todaySlots.length === 0 ? (
              <EmptyState icon={<CalendarClock className="h-5.5 w-5.5" />} title="Nothing scheduled today" />
            ) : (
              <div className="flex flex-col divide-y divide-white/6">
                {todaySlots.map((s) => (
                  <ListRow key={s.id} title={s.subject} subtitle={s.room ? `Room ${s.room}` : undefined} trailing={<span className="text-xs font-semibold text-ink-muted">{s.startTime}</span>} />
                ))}
              </div>
            )}

            <SectionHeader title="Upcoming Assignments" />
            {assignments.length === 0 ? (
              <EmptyState icon={<BookOpen className="h-5.5 w-5.5" />} title="No assignments due" />
            ) : (
              <div className="flex flex-col divide-y divide-white/6">
                {assignments.map((a) => (
                  <ListRow key={a.id} title={a.title} subtitle={`Due ${new Date(a.dueDate).toLocaleDateString()}`} trailing={<Badge tone="accent">{a.subject}</Badge>} />
                ))}
              </div>
            )}

            <SectionHeader title="Fees" />
            <ListRow
              href="/student/fees"
              leading={<IndianRupee className="h-5 w-5 text-accent-soft" />}
              title="View Fee Status"
              subtitle="Dues, payments & receipts"
            />

            {attendanceTrend.delta !== null && Math.abs(attendanceTrend.delta) >= 5 ? (
              <>
                <SectionHeader title="Insight" />
                <ExplainableInsightCard
                  icon={attendanceTrend.delta < 0 ? <TrendingDown className="h-4.5 w-4.5" /> : <TrendingUp className="h-4.5 w-4.5" />}
                  title={attendanceTrend.delta < 0 ? "Your attendance has dropped" : "Your attendance is improving"}
                  tone={attendanceTrend.delta < 0 ? "warning" : "success"}
                  whatChanged={`You were at ${attendanceTrend.priorPct}% last week, now ${attendanceTrend.recentPct}% this week (${attendanceTrend.delta > 0 ? "+" : ""}${attendanceTrend.delta} pts).`}
                  whyItMatters={
                    attendanceTrend.delta < 0
                      ? "Missed classes compound quickly — catching up gets harder the longer a gap continues."
                      : "Keep it up — steady attendance makes it much easier to stay on top of classwork."
                  }
                  whatCanIDo={attendanceTrend.delta < 0 ? [{ label: "View Attendance", href: "/student/schedule" }, { label: "Ask NEXUS AI", href: "/student/ai?prompt=Why has my attendance dropped?" }] : undefined}
                />
              </>
            ) : (
              <>
                <SectionHeader title="NEXUS Suggestion" />
                <InsightCard
                  href="/student/ai"
                  icon={<Sparkles className="h-4.5 w-4.5" />}
                  title="Ask NEXUS"
                  message={attendancePct !== null && attendancePct < 75 ? "Your attendance is below 75% — ask NEXUS what's affecting it." : "Ask about your schedule, assignments, or attendance any time."}
                  tone={attendancePct !== null && attendancePct < 75 ? "warning" : "accent"}
                />
              </>
            )}
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}
