"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { QRDisplay } from "@/components/ui/QRDisplay";
import { ListRow } from "@/components/ui/ListRow";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, LoadingState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getClassById } from "@/services/class-service";
import { getStudentsForClass } from "@/services/student-service";
import { getUserProfiles } from "@/services/user-service";
import { getAssignmentsForClass } from "@/services/assignment-service";
import { getAttendanceForClassRange, summarizeAttendance, compareAttendanceWindows, todayISO } from "@/services/attendance-service";
import { getParentsForStudent } from "@/services/parent-link-service";
import { getOrCreateConversation } from "@/services/messaging-service";
import { ExplainableInsightCard } from "@/components/ai/ExplainableInsightCard";
import type { Assignment, ClassEntity, UserProfile } from "@/types";
import { ClipboardCheck, FilePlus2, Users, BarChart3, Share2, MessageCircle, Megaphone, FileText, TrendingDown, TrendingUp } from "lucide-react";

export default function TeacherClassWorkspacePage() {
  const { classId } = useParams<{ classId: string }>();
  const { profile } = useAuthUser();
  const router = useRouter();
  const [cls, setCls] = useState<ClassEntity | null>(null);
  const [students, setStudents] = useState<{ id: string; user?: UserProfile }[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [attendancePct, setAttendancePct] = useState<number | null>(null);
  const [attendanceTrend, setAttendanceTrend] = useState<{ recentPct: number | null; priorPct: number | null; delta: number | null }>({
    recentPct: null,
    priorPct: null,
    delta: null,
  });
  const [markedToday, setMarkedToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);

  const messageParent = async (studentId: string) => {
    if (!profile?.schoolId || !profile.id) return;
    setMessaging(studentId);
    setMessageError(null);
    try {
      const parentIds = await getParentsForStudent(studentId);
      const targetId = parentIds[0] ?? studentId; // fall back to messaging the student if no parent linked yet
      const id = await getOrCreateConversation(profile.schoolId, profile.id, targetId);
      router.push(`/teacher/messages/${id}`);
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : "Couldn't open the conversation. Try again.");
    } finally {
      setMessaging(null);
    }
  };

  const loadWorkspace = () => {
    if (!profile?.schoolId || !classId) return;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const c = await getClassById(profile.schoolId!, classId);
        if (!c) { setLoading(false); return; }
        setCls(c);

        const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        const [roster, records, a] = await Promise.all([
          getStudentsForClass(profile.schoolId!, classId),
          getAttendanceForClassRange(profile.schoolId!, classId, since),
          getAssignmentsForClass(profile.schoolId!, classId),
        ]);
        const users = await getUserProfiles(roster.map((s) => s.userId));
        setStudents(roster.map((s) => ({ id: s.userId, user: users.get(s.userId) })));
        const trend = compareAttendanceWindows(records);
        setAttendanceTrend(trend);
        setAttendancePct(trend.recentPct ?? (records.length > 0 ? summarizeAttendance(records).percentPresent : null));
        setMarkedToday(records.some((r) => r.date === todayISO()));
        setAssignments(a);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Couldn't load this class.");
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(loadWorkspace, [profile?.schoolId, classId]);

  return (
    <AuthGuard allowRoles={["teacher"]}>
      <AppShell role="teacher">
        <PageHeader title={cls?.name ?? "Class"} subtitle={cls?.subject} />

        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={loadWorkspace} />
        ) : !cls ? (
          <EmptyState title="Class not found" />
        ) : (
          <>
            <GlassSurface rounded="2xl" className="flex divide-x divide-white/8" padded={false}>
              <Stat label="Students" value={cls.studentCount} />
              <Stat label="Attendance" value={attendancePct !== null ? `${attendancePct}%` : "—"} />
              <Stat label="Assignments" value={assignments.length} />
            </GlassSurface>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Link href={`/teacher/classes/${classId}/attendance`} className="glass-surface flex items-center gap-3 rounded-2xl p-4 active:scale-[0.97] transition-transform">
                <ClipboardCheck className="h-5 w-5 text-accent-soft" />
                <span className="text-sm font-medium text-ink">{markedToday ? "Edit Attendance" : "Mark Attendance"}</span>
              </Link>
              <Link href={`/teacher/classes/${classId}/assignments/new`} className="glass-surface flex items-center gap-3 rounded-2xl p-4 active:scale-[0.97] transition-transform">
                <FilePlus2 className="h-5 w-5 text-accent-soft" />
                <span className="text-sm font-medium text-ink">New Assignment</span>
              </Link>
              <Link href={`/teacher/classes/${classId}/documents`} className="glass-surface flex items-center gap-3 rounded-2xl p-4 active:scale-[0.97] transition-transform">
                <FileText className="h-5 w-5 text-accent-soft" />
                <span className="text-sm font-medium text-ink">Documents</span>
              </Link>
              <Link href={`/teacher/classes/${classId}/announcements`} className="glass-surface flex items-center gap-3 rounded-2xl p-4 active:scale-[0.97] transition-transform">
                <Megaphone className="h-5 w-5 text-accent-soft" />
                <span className="text-sm font-medium text-ink">Announcement</span>
              </Link>
            </div>

            {attendanceTrend.delta !== null && Math.abs(attendanceTrend.delta) >= 5 && (
              <div className="mt-6">
                <ExplainableInsightCard
                  icon={attendanceTrend.delta < 0 ? <TrendingDown className="h-4.5 w-4.5" /> : <TrendingUp className="h-4.5 w-4.5" />}
                  title={attendanceTrend.delta < 0 ? "Class attendance has declined" : "Class attendance has improved"}
                  tone={attendanceTrend.delta < 0 ? "warning" : "success"}
                  whatChanged={`${cls.name} attendance was ${attendanceTrend.priorPct}% last week, now ${attendanceTrend.recentPct}% this week (${attendanceTrend.delta > 0 ? "+" : ""}${attendanceTrend.delta} pts).`}
                  whyItMatters={
                    attendanceTrend.delta < 0
                      ? "A class-wide dip is worth a quick look — it can point to a scheduling clash, an illness going around, or a few students who need follow-up."
                      : "Consistent attendance across the class makes it easier to keep everyone on pace."
                  }
                  whatCanIDo={
                    attendanceTrend.delta < 0
                      ? [{ label: "View Students", href: `/teacher/classes/${classId}` }, { label: "Ask NEXUS AI", href: "/teacher/ai?prompt=Which students in my class have declining attendance?" }]
                      : undefined
                  }
                />
              </div>
            )}

            <div className="mt-6">
              <QRDisplay value={`https://nexus.app/join/class/${cls.code}`} code={cls.code} label="Class Code" size={140} />
            </div>

            {assignments.length > 0 && (
              <div className="mt-7">
                <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Assignments</p>
                <div className="flex flex-col divide-y divide-white/6">
                  {assignments.map((a) => (
                    <ListRow key={a.id} title={a.title} subtitle={`Due ${new Date(a.dueDate).toLocaleDateString()}`} trailing={<Badge tone="accent">{a.subject}</Badge>} />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-7">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Students</p>
              {messageError && <p className="mb-2 text-xs font-medium text-danger">{messageError}</p>}
              {students.length === 0 ? (
                <EmptyState icon={<Users className="h-5.5 w-5.5" />} title="No students yet" message="Share the class code so students can join." />
              ) : (
                <div className="flex flex-col divide-y divide-white/6">
                  {students.map((s) => (
                    <ListRow
                      key={s.id}
                      leading={<Avatar name={s.user?.fullName ?? "Student"} src={s.user?.photoURL} size="sm" />}
                      title={s.user?.fullName ?? "Student"}
                      trailing={
                        <button
                          onClick={() => messageParent(s.id)}
                          disabled={messaging === s.id}
                          aria-label={`Message ${s.user?.fullName ?? "student"}'s parent`}
                          className="flex h-8 w-8 items-center justify-center rounded-full glass-surface disabled:opacity-50"
                        >
                          <MessageCircle className="h-3.5 w-3.5 text-ink-muted" />
                        </button>
                      }
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
    <div className="flex-1 px-3 py-4 text-center">
      <p className="text-lg font-bold text-ink">{value}</p>
      <p className="text-[11px] text-ink-faint">{label}</p>
    </div>
  );
}
