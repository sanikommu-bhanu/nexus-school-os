"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ListRow } from "@/components/ui/ListRow";
import { Avatar } from "@/components/ui/Avatar";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { cn } from "@/lib/utils";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getClassesForSchool } from "@/services/class-service";
import { getStudentsForSchool } from "@/services/student-service";
import { getUserProfiles } from "@/services/user-service";
import {
  createFeeStructure,
  getFeeStructuresForSchool,
  getAllPaymentsForSchool,
  recordFeePayment,
} from "@/services/fee-service";
import type { ClassEntity, FeePayment, FeePaymentMethod, FeeStructure, StudentProfile, UserProfile } from "@/types";
import { IndianRupee, Receipt, Plus } from "lucide-react";
import { Stat } from "@/components/ui/Stat";

const TABS = ["structures", "record"] as const;
type Tab = (typeof TABS)[number];
const METHODS: FeePaymentMethod[] = ["cash", "upi", "bank_transfer", "cheque", "other"];

export default function AdminFeesPage() {
  const { profile } = useAuthUser();
  const [tab, setTab] = useState<Tab>("structures");
  const [classes, setClasses] = useState<ClassEntity[]>([]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [users, setUsers] = useState<Map<string, UserProfile>>(new Map());
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [structureForm, setStructureForm] = useState({ title: "", amount: "", dueDate: "", classId: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [paymentForm, setPaymentForm] = useState({ studentId: "", feeStructureId: "", amountPaid: "", method: "cash" as FeePaymentMethod });
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);

  const load = async () => {
    if (!profile?.schoolId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [c, s, f, p] = await Promise.all([
        getClassesForSchool(profile.schoolId),
        getStudentsForSchool(profile.schoolId),
        getFeeStructuresForSchool(profile.schoolId),
        getAllPaymentsForSchool(profile.schoolId),
      ]);
      setClasses(c);
      setStudents(s);
      setStructures(f);
      setPayments(p);
      setUsers(await getUserProfiles(s.map((st) => st.userId)));
    } catch (err) {
      // Previously no try/catch at all here — a failed initial load
      // left `loading` stuck true forever (infinite spinner) with no
      // way to recover short of a hard refresh.
      setLoadError(err instanceof Error ? err.message : "Couldn't load fee data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.schoolId]);

  const totalDue = structures.reduce((sum, s) => sum + s.amount * (s.classId ? students.filter((st) => st.classId === s.classId).length : students.length), 0);
  const totalCollected = payments.reduce((sum, p) => sum + p.amountPaid, 0);

  const handleCreateStructure = async () => {
    if (!profile?.schoolId || !profile.id || !structureForm.title || !structureForm.amount || !structureForm.dueDate) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createFeeStructure(profile.schoolId, profile.id, {
        title: structureForm.title,
        amount: Number(structureForm.amount),
        dueDate: structureForm.dueDate,
        classId: structureForm.classId || undefined,
      });
      setStructureForm({ title: "", amount: "", dueDate: "", classId: "" });
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Couldn't create this fee structure. Try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!profile?.schoolId || !profile.id || !paymentForm.studentId || !paymentForm.feeStructureId || !paymentForm.amountPaid) return;
    setRecording(true);
    setRecordError(null);
    try {
      await recordFeePayment(profile.schoolId, profile.id, {
        studentId: paymentForm.studentId,
        feeStructureId: paymentForm.feeStructureId,
        amountPaid: Number(paymentForm.amountPaid),
        method: paymentForm.method,
      });
      setRecorded(true);
      setPaymentForm({ studentId: "", feeStructureId: "", amountPaid: "", method: "cash" });
      await load();
      setTimeout(() => setRecorded(false), 2500);
    } catch (err) {
      // Money-handling flow — previously silent on failure, which is
      // the worst place for a false "it saved" impression.
      setRecordError(err instanceof Error ? err.message : "Couldn't record this payment. Try again.");
    } finally {
      setRecording(false);
    }
  };

  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <PageHeader title="Fee Management" subtitle="Dues, collection & payment records" />

        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={load} />
        ) : (
          <>
            <GlassSurface rounded="2xl" className="flex divide-x divide-white/8" padded={false}>
              <Stat label="Total Due" value={`₹${totalDue.toLocaleString("en-IN")}`} />
              <Stat label="Collected" value={`₹${totalCollected.toLocaleString("en-IN")}`} />
              <Stat label="Outstanding" value={`₹${Math.max(totalDue - totalCollected, 0).toLocaleString("en-IN")}`} />
            </GlassSurface>

            <div className="my-5 flex gap-2 rounded-full glass-surface p-1">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex-1 rounded-full px-3 py-2 text-xs font-medium capitalize transition-colors",
                    tab === t ? "bg-white/12 text-ink" : "text-ink-faint"
                  )}
                >
                  {t === "structures" ? "Fee Structures" : "Record Payment"}
                </button>
              ))}
            </div>

            {tab === "structures" ? (
              <>
                <GlassSurface rounded="2xl" className="flex flex-col gap-3">
                  <p className="text-sm font-semibold text-ink">New Fee Structure</p>
                  <Input placeholder="Title (e.g. Term 1 Tuition Fee)" value={structureForm.title} onChange={(e) => setStructureForm({ ...structureForm, title: e.target.value })} />
                  <Input placeholder="Amount (₹)" type="number" value={structureForm.amount} onChange={(e) => setStructureForm({ ...structureForm, amount: e.target.value })} />
                  <Input placeholder="Due date" type="date" value={structureForm.dueDate} onChange={(e) => setStructureForm({ ...structureForm, dueDate: e.target.value })} />
                  <select
                    value={structureForm.classId}
                    onChange={(e) => setStructureForm({ ...structureForm, classId: e.target.value })}
                    className="input-glass"
                  >
                    <option value="">Applies to whole school</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        Only {c.name}
                      </option>
                    ))}
                  </select>
                  {createError && <p className="text-xs font-medium text-danger">{createError}</p>}
                  <Button onClick={handleCreateStructure} loading={creating} disabled={!structureForm.title || !structureForm.amount || !structureForm.dueDate}>
                    <Plus className="mr-1 h-4 w-4" /> Create Fee Structure
                  </Button>
                </GlassSurface>

                <div className="mt-7">
                  <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">All Fee Structures</p>
                  {structures.length === 0 ? (
                    <EmptyState icon={<IndianRupee className="h-5.5 w-5.5" />} title="No fee structures yet" />
                  ) : (
                    <div className="flex flex-col divide-y divide-white/6">
                      {structures.map((s) => (
                        <ListRow
                          key={s.id}
                          title={s.title}
                          subtitle={`Due ${new Date(s.dueDate).toLocaleDateString()} · ${s.classId ? classes.find((c) => c.id === s.classId)?.name ?? "Class" : "Whole school"}`}
                          trailing={<Badge tone="accent">₹{s.amount.toLocaleString("en-IN")}</Badge>}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {recorded && (
                  <div className="mb-4 flex items-center gap-2 rounded-2xl glass-surface p-3 text-sm text-success">
                    <Receipt className="h-4 w-4" /> Payment recorded.
                  </div>
                )}
                <GlassSurface rounded="2xl" className="flex flex-col gap-3">
                  <p className="text-sm font-semibold text-ink">Record a Payment</p>
                  <select
                    value={paymentForm.studentId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, studentId: e.target.value })}
                    className="input-glass"
                  >
                    <option value="">Select student</option>
                    {students.map((s) => (
                      <option key={s.userId} value={s.userId}>
                        {users.get(s.userId)?.fullName ?? s.userId}
                      </option>
                    ))}
                  </select>
                  <select
                    value={paymentForm.feeStructureId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, feeStructureId: e.target.value })}
                    className="input-glass"
                  >
                    <option value="">Select fee structure</option>
                    {structures.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} (₹{s.amount.toLocaleString("en-IN")})
                      </option>
                    ))}
                  </select>
                  <Input placeholder="Amount paid (₹)" type="number" value={paymentForm.amountPaid} onChange={(e) => setPaymentForm({ ...paymentForm, amountPaid: e.target.value })} />
                  <div className="flex flex-wrap gap-2">
                    {METHODS.map((m) => (
                      <button
                        key={m}
                        onClick={() => setPaymentForm({ ...paymentForm, method: m })}
                        className={cn(
                          "rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors",
                          paymentForm.method === m ? "bg-accent text-white" : "glass-surface text-ink-muted"
                        )}
                      >
                        {m.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                  {recordError && <p className="text-xs font-medium text-danger">{recordError}</p>}
                  <Button
                    onClick={handleRecordPayment}
                    loading={recording}
                    disabled={!paymentForm.studentId || !paymentForm.feeStructureId || !paymentForm.amountPaid}
                  >
                    Record Payment
                  </Button>
                </GlassSurface>

                <div className="mt-7">
                  <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Recent Payments</p>
                  {payments.length === 0 ? (
                    <EmptyState icon={<Receipt className="h-5.5 w-5.5" />} title="No payments recorded yet" />
                  ) : (
                    <div className="flex flex-col divide-y divide-white/6">
                      {payments
                        .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
                        .slice(0, 20)
                        .map((p) => (
                          <ListRow
                            key={p.id}
                            leading={<Avatar name={users.get(p.studentId)?.fullName ?? "Student"} size="sm" />}
                            title={users.get(p.studentId)?.fullName ?? "Student"}
                            subtitle={`${new Date(p.paidAt).toLocaleDateString()} · ${p.method.replace("_", " ")}`}
                            trailing={<Badge tone="success">₹{p.amountPaid.toLocaleString("en-IN")}</Badge>}
                          />
                        ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}
