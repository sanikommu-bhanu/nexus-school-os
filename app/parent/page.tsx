"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { SectionHeader } from "@/components/ui/MetricCard";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { MessagesBell } from "@/components/shell/MessagesBell";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useSelectedChild } from "@/hooks/useSelectedChild";
import { getChildSnapshots, type ChildSnapshot } from "@/services/parent-view-service";
import { ensureParentSchoolId } from "@/services/parent-link-service";
import { getSchoolAnnouncements } from "@/services/announcement-service";
import { getOrCreateConversation } from "@/services/messaging-service";
import { getFeeStructuresForClass, getPaymentsForStudent, summarizeStudentFees, type StudentFeeSummary } from "@/services/fee-service";
import { ExplainableInsightCard } from "@/components/ai/ExplainableInsightCard";
import type { Announcement } from "@/types";
import { ChevronDown, Megaphone, MessageCircle, IndianRupee, TrendingDown, TrendingUp } from "lucide-react";

export default function ParentPage() {
  const { profile, refresh } = useAuthUser();
  const router = useRouter();
  const [children, setChildren] = useState<ChildSnapshot[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [feeSummary, setFeeSummary] = useState<StudentFeeSummary | null>(null);
  const { selectedChildId, setSelectedChildId } = useSelectedChild();

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      try {
        // Repair path for accounts linked before schoolId was written to
        // the parent's own profile. Everything on this screen except the
        // child snapshots is gated on profile.schoolId, so without this
        // those parents see a permanently half-empty dashboard. refresh()
        // re-reads the profile, which re-runs this effect with the id
        // present and fills the rest in.
        if (!profile.schoolId) {
          const healed = await ensureParentSchoolId(profile.id);
          if (healed) {
            await refresh();
            return;
          }
        }

        const snapshots = await getChildSnapshots(profile.id);
        setChildren(snapshots);
        if (snapshots.length > 0 && !selectedChildId) setSelectedChildId(snapshots[0].studentId);
        if (profile.schoolId) setAnnouncements(await getSchoolAnnouncements(profile.schoolId, 3));
      } catch (err) {
        // Without this, a rejected read left `loading` true forever and
        // the screen sat on "Loading your children's data…" with nothing
        // explaining why.
        setLoadError(err instanceof Error ? err.message : "We couldn't load your children's data.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.schoolId]);

  const child = children.find((c) => c.studentId === selectedChildId) ?? children[0];

  // Hoisted to primitives so the dependency list is exactly the three
  // ids the effect actually reads. Depending on `child` itself (which is
  // what the exhaustive-deps rule would otherwise ask for) would re-run
  // this on every render that rebuilds the object, even when the ids are
  // unchanged — so this keeps the original, narrower behaviour while
  // making the dependency list honest.
  const feeSchoolId = profile?.schoolId;
  const feeStudentId = child?.studentId;
  const feeClassId = child?.cls?.id;

  useEffect(() => {
    if (!feeSchoolId || !feeClassId || !feeStudentId) { setFeeSummary(null); return; }
    (async () => {
      const [structures, payments] = await Promise.all([
        getFeeStructuresForClass(feeSchoolId, feeClassId),
        getPaymentsForStudent(feeSchoolId, feeStudentId),
      ]);
      setFeeSummary(summarizeStudentFees(structures, payments));
    })();
  }, [feeSchoolId, feeStudentId, feeClassId]);

  const messageTeacher = async () => {
    if (!profile?.schoolId || !profile.id || !child?.cls?.teacherId) return;
    setMessaging(true);
    setMessageError(null);
    try {
      const id = await getOrCreateConversation(profile.schoolId, profile.id, child.cls.teacherId);
      router.push(`/parent/messages/${id}`);
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : "Couldn't open the conversation. Try again.");
    } finally {
      setMessaging(false);
    }
  };

  return (
    <AuthGuard allowRoles={["parent"]}>
      <AppShell role="parent">
        <div className="flex items-center justify-between pb-6 pt-8">
          <div>
            <p className="text-sm text-ink-muted">Welcome,</p>
            <h1 className="text-xl font-bold text-ink">{profile?.fullName ?? "Parent"} 👋</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <MessagesBell schoolId={profile?.schoolId} uid={profile?.id} role="parent" />
            <Avatar name={profile?.fullName ?? "Parent"} src={profile?.photoURL} size="lg" />
          </div>
        </div>

        {loading ? (
          <LoadingState message="Loading your children's data…" />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : children.length === 0 ? (
          <EmptyState title="No children connected yet" message="Use a parent-connect code or QR from setup to link your child." />
        ) : (
          <>
            {children.length > 1 && (
              <Link href="/parent/child" className="glass-surface mb-5 flex items-center justify-between rounded-2xl px-4 py-3">
                <span className="text-sm font-medium text-ink">{child?.name}</span>
                <ChevronDown className="h-4 w-4 text-ink-faint" />
              </Link>
            )}

            {child && (
              <>
                <div className="flex items-center gap-3">
                  <Avatar name={child.name} src={child.photoURL} size="lg" />
                  <div>
                    <h2 className="text-lg font-bold text-ink">{child.name}</h2>
                    <p className="text-sm text-ink-muted">{child.cls?.name ?? "No class"}</p>
                  </div>
                </div>

                <GlassSurface rounded="2xl" className="mt-5 flex divide-x divide-white/8" padded={false}>
                  <Stat label="Attendance" value={child.attendancePct !== null ? `${child.attendancePct}%` : "—"} />
                  <Stat label="Assignments" value={`${child.pendingAssignments} pending`} />
                  <Stat label="Next class" value={child.nextClass ? `${child.nextClass.subject} ${child.nextClass.startTime}` : "—"} />
                </GlassSurface>

                {child.attendanceTrend.delta !== null && Math.abs(child.attendanceTrend.delta) >= 5 && (
                  <div className="mt-5">
                    <ExplainableInsightCard
                      icon={child.attendanceTrend.delta < 0 ? <TrendingDown className="h-4.5 w-4.5" /> : <TrendingUp className="h-4.5 w-4.5" />}
                      title={child.attendanceTrend.delta < 0 ? "Attendance has declined" : "Attendance has improved"}
                      tone={child.attendanceTrend.delta < 0 ? "warning" : "success"}
                      whatChanged={`${child.name}'s attendance was ${child.attendanceTrend.priorPct}% last week, now ${child.attendanceTrend.recentPct}% this week (${child.attendanceTrend.delta > 0 ? "+" : ""}${child.attendanceTrend.delta} pts).`}
                      whyItMatters={
                        child.attendanceTrend.delta < 0
                          ? "Consistent attendance is closely tied to keeping up with classwork — a sustained drop is worth understanding early."
                          : "Consistent attendance helps your child stay on track with classwork and assessments."
                      }
                      whatCanIDo={
                        child.attendanceTrend.delta < 0
                          ? [{ label: "Message Teacher", href: `/parent/messages` }, { label: "Ask NEXUS AI", href: "/parent/ai?prompt=Why has my child's attendance declined?" }]
                          : undefined
                      }
                    />
                  </div>
                )}

                <SectionHeader
                  title="Fees"
                  action={
                    <Link href="/parent/fees" className="text-xs font-semibold text-accent-soft">
                      See all
                    </Link>
                  }
                />
                {feeSummary && feeSummary.structures.length > 0 ? (
                  <Link href="/parent/fees" className="glass-surface flex items-center gap-3 rounded-2xl p-4">
                    <IndianRupee className="h-5 w-5 shrink-0 text-accent-soft" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {feeSummary.balance > 0 ? `₹${feeSummary.balance.toLocaleString("en-IN")} outstanding` : "All fees paid"}
                      </p>
                      <p className="text-xs text-ink-muted">
                        ₹{feeSummary.totalPaid.toLocaleString("en-IN")} of ₹{feeSummary.totalDue.toLocaleString("en-IN")} paid
                      </p>
                    </div>
                  </Link>
                ) : (
                  <EmptyState icon={<IndianRupee className="h-5.5 w-5.5" />} title="No fees set up yet" />
                )}

                <SectionHeader
                  title="Announcements"
                  action={
                    <Link href="/parent/updates" className="text-xs font-semibold text-accent-soft">
                      See all
                    </Link>
                  }
                />
                {announcements.length === 0 ? (
                  <EmptyState icon={<Megaphone className="h-5.5 w-5.5" />} title="No announcements yet" />
                ) : (
                  <div className="flex flex-col divide-y divide-white/6">
                    {announcements.map((a) => (
                      <ListRow key={a.id} title={a.title} subtitle={a.message} />
                    ))}
                  </div>
                )}

                <SectionHeader title="Teacher Communication" />
                {child.cls ? (
                  <>
                    <button onClick={messageTeacher} disabled={messaging} className="w-full text-left disabled:opacity-50">
                      <ListRow
                        leading={<MessageCircle className="h-5 w-5 text-accent-soft" />}
                        title={`Message ${child.cls.name}'s teacher`}
                        subtitle={messaging ? "Opening conversation…" : "Ask about progress or attendance"}
                      />
                    </button>
                    {messageError && <p className="mt-1 text-xs font-medium text-danger">{messageError}</p>}
                  </>
                ) : (
                  <EmptyState title="No class assigned yet" />
                )}
              </>
            )}
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 flex-1 px-3 py-4 text-center">
      <p className="truncate text-sm font-bold text-ink">{value}</p>
      <p className="text-[11px] text-ink-faint">{label}</p>
    </div>
  );
}
