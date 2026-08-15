"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { cn } from "@/lib/utils";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getClassById } from "@/services/class-service";
import { getTeachersForSchool } from "@/services/teacher-service";
import { getUserProfiles } from "@/services/user-service";
import { getTimetableForClass, createTimetableSlot, deleteTimetableSlot, detectConflicts, groupByDay } from "@/services/timetable-service";
import { WEEKDAYS } from "@/types";
import type { ClassEntity, TimetableSlot, TeacherProfile, UserProfile, Weekday } from "@/types";
import { Plus, AlertTriangle, Check, Trash2, X, CalendarClock } from "lucide-react";

const DAY_LABEL: Record<Weekday, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };

interface DraftSlot {
  day: Weekday;
  period: number;
  startTime: string;
  endTime: string;
  subject: string;
  room: string;
  teacherId: string;
}

export default function AdminTimetablePage() {
  const { classId } = useParams<{ classId: string }>();
  const { profile } = useAuthUser();
  const reduceMotion = useReducedMotion();

  const [cls, setCls] = useState<ClassEntity | null>(null);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [teacherNames, setTeacherNames] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [draft, setDraft] = useState<DraftSlot>({ day: "MO", period: 1, startTime: "09:00", endTime: "09:45", subject: "", room: "", teacherId: "" });
  const [conflicts, setConflicts] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadTimetable = () => {
    if (!profile?.schoolId || !classId) return;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const c = await getClassById(profile.schoolId!, classId);
        setCls(c);
        if (c) setDraft((d) => ({ ...d, teacherId: c.teacherId }));
        const [t, s] = await Promise.all([getTeachersForSchool(profile.schoolId!), getTimetableForClass(profile.schoolId!, classId)]);
        setTeachers(t);
        setSlots(s);
        const users = await getUserProfiles(t.map((tt) => tt.userId));
        setTeacherNames(users);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Couldn't load the timetable.");
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(loadTimetable, [profile?.schoolId, classId]);

  const grouped = groupByDay(slots);

  const runPreview = async () => {
    if (!profile?.schoolId || !classId) return;
    setChecking(true);
    setCheckError(null);
    setConflicts(null);
    try {
      const found = await detectConflicts(profile.schoolId, {
        classId,
        teacherId: draft.teacherId,
        day: draft.day,
        period: draft.period,
        ...(draft.room.trim() ? { room: draft.room.trim() } : {}),
      });
      setConflicts(found);
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "Couldn't check for conflicts. Try again.");
    } finally {
      setChecking(false);
    }
  };

  const apply = async () => {
    if (!profile?.schoolId || !classId || !draft.subject.trim() || !draft.teacherId) return;
    setApplying(true);
    setApplyError(null);
    try {
      // Firestore's client SDK rejects explicit `undefined` field values
      // (see services/document-service.ts for the same fix) — so `room`
      // is only included in the payload when it's actually set, rather
      // than passed as `room: draft.room || undefined`.
      const { slot } = await createTimetableSlot(profile.schoolId, {
        classId,
        teacherId: draft.teacherId,
        subject: draft.subject.trim(),
        day: draft.day,
        period: draft.period,
        startTime: draft.startTime,
        endTime: draft.endTime,
        ...(draft.room.trim() ? { room: draft.room.trim() } : {}),
      });
      setSlots((prev) => [...prev, slot]);
      setShowForm(false);
      setConflicts(null);
      setDraft((d) => ({ ...d, subject: "", room: "" }));
    } catch (err) {
      // Previously silent: a failed apply reset the button with no
      // indication the slot was never created, so an admin could
      // believe a schedule change went live when it never wrote.
      setApplyError(err instanceof Error ? err.message : "Couldn't apply this slot. Try again.");
    } finally {
      setApplying(false);
    }
  };

  const removeSlot = async (slotId: string) => {
    if (!profile?.schoolId) return;
    setDeletingId(slotId);
    setDeleteError(null);
    try {
      await deleteTimetableSlot(profile.schoolId, slotId);
      setSlots((prev) => prev.filter((s) => s.id !== slotId));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't remove that slot. Try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const transition = reduceMotion ? { duration: 0 } : { duration: 0.25 };

  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <PageHeader title="Timetable" subtitle={cls?.name} />

        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={loadTimetable} />
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Current Schedule</p>
              <button
                onClick={() => setShowForm((v) => !v)}
                className="flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent-soft"
              >
                <Plus className="h-3.5 w-3.5" /> Add Slot
              </button>
            </div>

            <AnimatePresence>
              {showForm && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={transition} className="overflow-hidden">
                  <GlassSurface rounded="2xl" className="mb-5 flex flex-col gap-3">
                    <p className="text-sm font-semibold text-ink">Propose a new slot</p>

                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                      {WEEKDAYS.map((d) => (
                        <button
                          key={d}
                          onClick={() => { setDraft((s) => ({ ...s, day: d })); setConflicts(null); }}
                          className={cn(
                            "shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
                            draft.day === d ? "bg-accent/20 text-accent-soft" : "bg-white/6 text-ink-muted"
                          )}
                        >
                          {DAY_LABEL[d]}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <LabeledInput label="Period" type="number" min={1} value={draft.period} onChange={(v) => { setDraft((s) => ({ ...s, period: Number(v) || 1 })); setConflicts(null); }} />
                      <LabeledInput label="Room (optional)" value={draft.room} onChange={(v) => { setDraft((s) => ({ ...s, room: v })); setConflicts(null); }} />
                      <LabeledInput label="Start time" type="time" value={draft.startTime} onChange={(v) => setDraft((s) => ({ ...s, startTime: v }))} />
                      <LabeledInput label="End time" type="time" value={draft.endTime} onChange={(v) => setDraft((s) => ({ ...s, endTime: v }))} />
                    </div>
                    <LabeledInput label="Subject" value={draft.subject} onChange={(v) => setDraft((s) => ({ ...s, subject: v }))} />

                    <div>
                      <p className="mb-1.5 text-xs font-medium text-ink-muted">Teacher</p>
                      <select
                        value={draft.teacherId}
                        onChange={(e) => { setDraft((s) => ({ ...s, teacherId: e.target.value })); setConflicts(null); }}
                        className="input-glass text-sm"
                      >
                        {teachers.map((t) => (
                          <option key={t.userId} value={t.userId}>
                            {teacherNames.get(t.userId)?.fullName ?? t.userId}
                          </option>
                        ))}
                      </select>
                    </div>

                    {conflicts === null ? (
                      <>
                        {checkError && <p className="text-xs font-medium text-danger">{checkError}</p>}
                        <Button variant="ghost" onClick={runPreview} loading={checking} disabled={!draft.teacherId}>
                          Preview Changes
                        </Button>
                      </>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <PreviewDiff current={grouped[draft.day] ?? []} draft={draft} />
                        {conflicts.length > 0 ? (
                          <div className="flex flex-col gap-2 rounded-xl bg-danger/10 p-3">
                            <div className="flex items-center gap-2 text-danger">
                              <AlertTriangle className="h-4 w-4" />
                              <p className="text-xs font-semibold">{conflicts.length} conflict{conflicts.length > 1 ? "s" : ""} detected</p>
                            </div>
                            {conflicts.map((c, i) => (
                              <p key={i} className="text-xs text-ink-muted">
                                • {c}
                              </p>
                            ))}
                            <p className="text-[11px] text-ink-faint">You can still apply, but review this carefully — NEXUS AI won't resolve conflicts automatically.</p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded-xl bg-success/10 p-3 text-success">
                            <Check className="h-4 w-4" />
                            <p className="text-xs font-semibold">No conflicts found.</p>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => setConflicts(null)} className="flex-1 rounded-2xl bg-white/8 py-3 text-sm font-semibold text-ink">
                            Back
                          </button>
                          <Button onClick={apply} loading={applying} disabled={!draft.subject.trim()} className={conflicts.length > 0 ? "!bg-danger/80" : undefined}>
                            {conflicts.length > 0 ? "Apply Anyway" : "Apply"}
                          </Button>
                        </div>
                        {applyError && <p className="text-xs font-medium text-danger">{applyError}</p>}
                      </div>
                    )}
                  </GlassSurface>
                </motion.div>
              )}
            </AnimatePresence>

            {deleteError && <p className="mb-3 text-center text-xs font-medium text-danger">{deleteError}</p>}

            {slots.length === 0 ? (
              <EmptyState icon={<CalendarClock className="h-5.5 w-5.5" />} title="No timetable slots yet" message="Add the first slot for this class above." />
            ) : (
              <div className="flex flex-col gap-5">
                {WEEKDAYS.filter((d) => grouped[d]?.length).map((d) => (
                  <div key={d}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{DAY_LABEL[d]}</p>
                    <div className="flex flex-col divide-y divide-white/6">
                      {grouped[d].map((s) => (
                        <div key={s.id} className="flex items-center gap-3 py-3">
                          <div className="w-16 shrink-0 text-xs text-ink-faint">{s.startTime}</div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink">{s.subject}</p>
                            <p className="truncate text-xs text-ink-muted">{teacherNames.get(s.teacherId)?.fullName ?? "Teacher"}{s.room ? ` · Room ${s.room}` : ""}</p>
                          </div>
                          <button
                            onClick={() => removeSlot(s.id)}
                            disabled={deletingId === s.id}
                            aria-label="Remove slot"
                            className="flex h-8 w-8 items-center justify-center rounded-full glass-surface disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-danger" />
                          </button>
                        </div>
                      ))}
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

function PreviewDiff({ current, draft }: { current: TimetableSlot[]; draft: DraftSlot }) {
  const sameSlot = current.find((s) => s.period === draft.period);
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Proposed Diff — {draft.day}, Period {draft.period}</p>
      {sameSlot && (
        <div className="mb-1.5 flex items-center gap-2 text-xs">
          <Badge tone="danger">Current</Badge>
          <span className="text-ink-muted line-through decoration-danger/60">{sameSlot.startTime} {sameSlot.subject}</span>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        <Badge tone="success">Proposed</Badge>
        <span className="text-ink">{draft.startTime}–{draft.endTime} {draft.subject || "(subject)"}{draft.room ? ` · Room ${draft.room}` : ""}</span>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  min,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  min?: number;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-ink-muted">{label}</p>
      <input
        type={type}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-glass !py-2.5 text-sm"
      />
    </div>
  );
}
