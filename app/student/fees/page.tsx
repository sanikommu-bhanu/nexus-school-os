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
import { getStudentProfile } from "@/services/student-service";
import { getFeeStructuresForClass, getPaymentsForStudent, summarizeStudentFees } from "@/services/fee-service";
import type { StudentFeeSummary } from "@/services/fee-service";
import { Receipt, IndianRupee } from "lucide-react";
import { Stat } from "@/components/ui/Stat";

export default function StudentFeesPage() {
  const { profile } = useAuthUser();
  const [summary, setSummary] = useState<StudentFeeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.schoolId || !profile.id) return;
    (async () => {
      const student = await getStudentProfile(profile.id);
      if (!student) { setLoading(false); return; }
      const [structures, payments] = await Promise.all([
        getFeeStructuresForClass(profile.schoolId!, student.classId),
        getPaymentsForStudent(profile.schoolId!, profile.id),
      ]);
      setSummary(summarizeStudentFees(structures, payments));
      setLoading(false);
    })().catch((err) => {
      // A rejected read used to escape unhandled, leaving
      // `loading` true forever: the screen showed its spinner
      // permanently with the real reason only in the console.
      setLoadError(err instanceof Error ? err.message : "Something went wrong loading this screen.");
      setLoading(false);
    });
  }, [profile?.schoolId, profile?.id]);

  return (
    <AuthGuard allowRoles={["student"]}>
      <AppShell role="student">
        <PageHeader title="Fees" showBack={false} />

        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : !summary || summary.structures.length === 0 ? (
          <EmptyState icon={<IndianRupee className="h-5.5 w-5.5" />} title="No fees set up yet" message="Your school hasn't published any fee structures." />
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
              Fees are collected at the school office and recorded by your admin — this screen reflects the school&apos;s official record, updated automatically.
            </p>
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}
