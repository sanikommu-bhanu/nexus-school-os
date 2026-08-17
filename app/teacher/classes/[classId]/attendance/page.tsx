"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { SuccessState, LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { cn } from "@/lib/utils";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getStudentsForClass } from "@/services/student-service";
import { getUserProfiles } from "@/services/user-service";
import { getAttendanceForClassDate, saveAttendance, todayISO } from "@/services/attendance-service";
import type { AttendanceStatus, UserProfile } from "@/types";
import { Check, ScanLine } from "lucide-react";
import { ScanToMark } from "@/components/attendance/ScanToMark";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; tone: string }[] = [
  { value: "present", label: "P", tone: "bg-success/20 text-success border-success/40" },
  { value: "absent", label: "A", tone: "bg-danger/20 text-danger border-danger/40" },
  { value: "late", label: "L", tone: "bg-warning/20 text-warning border-warning/40" },
  { value: "excused", label: "E", tone: "bg-accent/20 text-accent-soft border-accent/40" },
];

export default function MarkAttendancePage() {
  const { classId } = useParams<{ classId: string }>();
  const router = useRouter();
  const { profile } = useAuthUser();
  const [students, setStudents] = useState<{ id: string; rollNumber?: string; user?: UserProfile }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const date = todayISO();

  const loadRoster = () => {
    if (!profile?.schoolId || !classId) return;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [roster, existing] = await Promise.all([
          getStudentsForClass(profile.schoolId!, classId),
          getAttendanceForClassDate(profile.schoolId!, classId, date),
        ]);
        const users = await getUserProfiles(roster.map((s) => s.userId));
        setStudents(roster.map((s) => ({ id: s.userId, rollNumber: s.rollNumber, user: users.get(s.userId) })));
        const initial: Record<string, AttendanceStatus> = {};
        roster.forEach((s) => {
          initial[s.userId] = existing.find((e) => e.studentId === s.userId)?.status ?? "present";
        });
        setStatuses(initial);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Couldn't load the class roster.");
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(loadRoster, [profile?.schoolId, classId, date]);

  const markAllPresent = () => {
    setStatuses((prev) => Object.fromEntries(Object.keys(prev).map((id) => [id, "present" as AttendanceStatus])));
  };

  const handleSave = async () => {
    if (!profile?.schoolId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveAttendance(
        profile.schoolId,
        classId,
        date,
        profile.id,
        Object.entries(statuses).map(([studentId, status]) => ({ studentId, status }))
      );
      setSaved(true);
    } catch (err) {
      // Previously a bare try/finally: a failed write reset the Save
      // button silently with no feedback, so a teacher could believe
      // attendance was recorded when it never wrote to Firestore.
      setSaveError(err instanceof Error ? err.message : "Attendance didn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const counts = Object.values(statuses).reduce(
    (acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }),
    {} as Record<string, number>
  );

  return (
    <AuthGuard allowRoles={["teacher"]}>
      <AppShell role="teacher">
        <PageHeader title="Attendance" subtitle={new Date(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} />

        {saved ? (
          <SuccessState title="Attendance saved" message={`${students.length} students recorded for ${date}.`} />
        ) : loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={loadRoster} />
        ) : students.length === 0 ? (
          <EmptyState title="No students in this class yet" />
        ) : (
          <>
            <GlassSurface rounded="2xl" className="mb-4 flex items-center justify-between">
              <div className="flex gap-3 text-xs text-ink-muted">
                <span className="text-success">{counts.present ?? 0} present</span>
                <span className="text-danger">{counts.absent ?? 0} absent</span>
                <span className="text-warning">{counts.late ?? 0} late</span>
              </div>
              <button onClick={markAllPresent} className="text-xs font-semibold text-accent-soft">Mark all present</button>
            </GlassSurface>

            {scanning ? (
              <div className="mb-4">
                <ScanToMark
                  roster={students.map((s) => ({
                    id: s.id,
                    rollNumber: s.rollNumber,
                    name: s.user?.fullName,
                  }))}
                  // Writes into the SAME `statuses` map the manual
                  // buttons use, so a scanned register and a hand-marked
                  // one are indistinguishable by the time they are saved.
                  onMarkPresent={(studentId) =>
                    setStatuses((prev) => ({ ...prev, [studentId]: "present" }))
                  }
                  onClose={() => setScanning(false)}
                />
              </div>
            ) : (
              <button
                onClick={() => setScanning(true)}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent/15 py-3 text-sm font-semibold text-accent-soft transition-transform active:scale-[0.98]"
              >
                <ScanLine className="h-4 w-4" /> Scan students in
              </button>
            )}

            <div className="flex flex-col gap-2">
              {students.map((s) => (
                <div key={s.id} className="glass-surface flex items-center justify-between rounded-2xl p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={s.user?.fullName ?? "Student"} src={s.user?.photoURL} size="sm" />
                    <p className="truncate text-sm font-medium text-ink">{s.user?.fullName ?? "Student"}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setStatuses((prev) => ({ ...prev, [s.id]: opt.value }))}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition-transform active:scale-90",
                          statuses[s.id] === opt.value ? opt.tone : "border-white/10 text-ink-faint"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6">
              {saveError && <p className="mb-2 text-center text-xs font-medium text-danger">{saveError}</p>}
              <Button onClick={handleSave} loading={saving}>
                <Check className="h-4 w-4" /> Save Attendance
              </Button>
            </div>
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}
