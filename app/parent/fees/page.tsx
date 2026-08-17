"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { Badge } from "@/components/ui/Badge";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useSelectedChild } from "@/hooks/useSelectedChild";
import { getChildSnapshots, type ChildSnapshot } from "@/services/parent-view-service";
import { getFeeStructuresForClass, getPaymentsForStudent, summarizeStudentFees } from "@/services/fee-service";
import type { StudentFeeSummary } from "@/services/fee-service";
import { IndianRupee, Receipt } from "lucide-react";
import { Stat } from "@/components/ui/Stat";

export default function ParentFeesPage() {
  const { profile } = useAuthUser();
  const { selectedChildId } = useSelectedChild();
  const [child, setChild] = useState<ChildSnapshot | null>(null);
  const [summary, setSummary] = useState<StudentFeeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.id || !profile.schoolId) return;
    (async () => {
      const children = await getChildSnapshots(profile.id);
      const c = children.find((x) => x.studentId === selectedChildId) ?? children[0];
      setChild(c ?? null);
      if (c?.cls) {
        const [structures, payments] = await Promise.all([
          getFeeStructuresForClass(profile.schoolId!, c.cls.id),
          getPaymentsForStudent(profile.schoolId!, c.studentId),
        ]);
        setSummary(summarizeStudentFees(structures, payments));
      }
      setLoading(false);
    })().catch((err) => {
      // A rejected read used to escape unhandled, leaving
      // `loading` true forever: the screen showed its spinner
      // permanently with the real reason only in the console.
      setLoadError(err instanceof Error ? err.message : "Something went wrong loading this screen.");
      setLoading(false);
    });
  }, [profile?.id, profile?.schoolId, selectedChildId]);

  return (
    <AuthGuard allowRoles={["parent"]}>
      <AppShell role="parent">
        <PageHeader title="Fees" subtitle={child?.name} />

        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : !summary || summary.structures.length === 0 ? (
          <EmptyState icon={<IndianRupee className="h-5.5 w-5.5" />} title="No fees set up yet" message="The school hasn't published any fee structures for this class." />
        ) : (
          <>
            <GlassSurface rounded="2xl" className="flex divide-x divide-white/8" padded={false}>
              <Stat label="Total Due" value={`₹${summary.totalDue.toLocaleString("en-IN")}`} />
              <Stat label="Paid" value={`₹${summary.totalPaid.toLocaleString("en-IN")}`} />
              <Stat label="Balance" value={`₹${summary.balance.toLocaleString("en-IN")}`} tone={summary.balance > 0 ? "warning" : "success"} />
            </GlassSurface>

            <div className="mt-7">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Fee Structures</p>
              <div className="flex flex-col divide-y divide-white/6">
                {summary.structures.map((s) => (
                  <ListRow
                    key={s.id}
                    title={s.title}
                    subtitle={`Due ${new Date(s.dueDate).toLocaleDateString()} · ₹${s.paid.toLocaleString("en-IN")} of ₹${s.amount.toLocaleString("en-IN")} paid`}
                    trailing={<Badge tone={s.isPaid ? "success" : "warning"}>{s.isPaid ? "Paid" : "Due"}</Badge>}
                  />
                ))}
              </div>
            </div>

            <p className="mt-6 rounded-2xl glass-surface p-3.5 text-xs text-ink-muted">
              <Receipt className="mr-1.5 inline h-3.5 w-3.5" />
              Fees are collected at the school office and recorded by the admin — this reflects the school&apos;s official record.
            </p>
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}
