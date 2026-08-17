"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { MetricCard, SectionHeader } from "@/components/ui/MetricCard";
import { InsightCard } from "@/components/ui/ListRow";
import { LoadingState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useSchoolPulse } from "@/hooks/useSchoolPulse";
import { subscribeToNotifications } from "@/services/notification-service";
import { ExplainableInsightCard } from "@/components/ai/ExplainableInsightCard";
import type { NotificationItem } from "@/types";
import { UserPlus, FolderPlus, ClipboardCheck, UploadCloud, TrendingDown, CheckCircle2, Bell } from "lucide-react";

export default function AdminPage() {
  const { profile } = useAuthUser();

  // Live: members, classes and today's attendance stream in over
  // onSnapshot, so a teacher marking the register or a student joining
  // updates this dashboard without a refresh. Replaces the one-shot
  // read-on-mount this screen used to do. The arithmetic behind these
  // figures is unchanged — see derivePulse in the store.
  const { pulse, trends: lowAttendance, loading, error: loadError } = useSchoolPulse(profile?.schoolId);

  const [activity, setActivity] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!profile?.schoolId || !profile.id) return;
    return subscribeToNotifications(profile.schoolId, profile.id, setActivity);
  }, [profile?.schoolId, profile?.id]);

  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <div className="flex items-center justify-between pb-6 pt-8">
          <div>
            <p className="text-sm text-ink-muted">Good morning,</p>
            <h1 className="text-xl font-bold text-ink">{profile?.fullName ?? "Admin"} 👋</h1>
          </div>
          <Avatar name={profile?.fullName ?? "Admin"} src={profile?.photoURL} size="lg" />
        </div>

        {loading ? (
          <LoadingState message="Loading your school's pulse…" />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : !pulse ? (
          <ErrorState message="Couldn't load your school's pulse." onRetry={() => window.location.reload()} />
        ) : (
          <>
            <SectionHeader title="School Pulse" />
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Students" value={pulse.students} />
              <MetricCard label="Teachers" value={pulse.teachers} />
              <MetricCard label="Classes" value={pulse.classes} />
              <MetricCard
                label="Attendance today"
                value={pulse.attendanceToday > 0 ? `${pulse.attendanceToday}%` : "—"}
                tone={pulse.attendanceToday > 0 && pulse.attendanceToday < 75 ? "danger" : "success"}
              />
            </div>

            <SectionHeader title="NEXUS Intelligence" />
            {lowAttendance.length === 0 ? (
              <InsightCard
                icon={<CheckCircle2 className="h-4.5 w-4.5" />}
                title="Everything looks good"
                message="No attendance or operational issues detected this week."
                tone="success"
              />
            ) : (
              <div className="flex flex-col gap-2.5">
                {lowAttendance.map((c) => (
                  <ExplainableInsightCard
                    key={c.classId}
                    icon={<TrendingDown className="h-4.5 w-4.5" />}
                    title="Attendance below threshold"
                    tone="warning"
                    whatChanged={
                      c.trend.delta !== null
                        ? `${c.className} attendance was ${c.trend.priorPct}% last week, now ${c.trend.recentPct}% this week (${c.trend.delta > 0 ? "+" : ""}${c.trend.delta} pts) — below the 85% target.`
                        : `${c.className} attendance is ${c.percent}% this week — below the 85% target.`
                    }
                    whyItMatters="Classes below the attendance target are more likely to fall behind on coursework, and a persistent dip can point to a scheduling, transport, or health issue worth investigating early."
                    whatCanIDo={[
                      { label: "View Class", href: `/admin/classes/${c.classId}` },
                      { label: "Ask NEXUS AI", href: "/admin/ai?prompt=Which students are below the attendance threshold?" },
                    ]}
                  />
                ))}
              </div>
            )}

            <SectionHeader title="Quick Actions" />
            <div className="grid grid-cols-2 gap-3">
              <QuickAction href="/admin/school?tab=teachers" icon={UserPlus} label="Add Teacher" />
              <QuickAction href="/admin/classes?new=1" icon={FolderPlus} label="Create Class" />
              <QuickAction href="/admin/operations" icon={ClipboardCheck} label="View Attendance" />
              <QuickAction href="/admin/operations?tab=documents" icon={UploadCloud} label="Upload Document" />
            </div>

            <SectionHeader title="Recent Activity" />
            {activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-faint">Nothing yet — activity will show up here as it happens.</p>
            ) : (
              <div className="glass-surface flex flex-col divide-y divide-white/8 rounded-2xl">
                {activity.slice(0, 6).map((a) => (
                  <div key={a.id} className="flex items-start gap-3 px-4 py-3">
                    <Bell className="mt-0.5 h-4 w-4 shrink-0 text-accent-soft" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{a.title}</p>
                      <p className="truncate text-xs text-ink-muted">{a.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return (
    <Link href={href} className="glass-surface flex flex-col items-center justify-center gap-2 rounded-2xl py-5 text-center active:scale-[0.97] transition-transform">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15">
        <Icon className="h-4.5 w-4.5 text-accent-soft" />
      </div>
      <p className="text-xs font-medium text-ink">{label}</p>
    </Link>
  );
}
