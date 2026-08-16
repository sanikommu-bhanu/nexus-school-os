"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { cn } from "@/lib/utils";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getTimetableForTeacher, groupByDay } from "@/services/timetable-service";
import { getClassesForTeacher } from "@/services/class-service";
import type { ClassEntity, TimetableSlot, Weekday } from "@/types";
import { WEEKDAYS } from "@/types";
import { CalendarClock } from "lucide-react";

const DAY_LABEL: Record<Weekday, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };

export default function TeacherSchedulePage() {
  const { profile } = useAuthUser();
  const [grouped, setGrouped] = useState<Record<Weekday, TimetableSlot[]>>({} as any);
  const [classes, setClasses] = useState<ClassEntity[]>([]);
  const [day, setDay] = useState<Weekday>(WEEKDAYS[0]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.schoolId) return;
    (async () => {
      const [slots, c] = await Promise.all([
        getTimetableForTeacher(profile.schoolId!, profile.id),
        getClassesForTeacher(profile.schoolId!, profile.id),
      ]);
      setGrouped(groupByDay(slots));
      setClasses(c);
      const todayIdx = new Date().getDay();
      setDay(WEEKDAYS[Math.max(0, todayIdx - 1) % WEEKDAYS.length]);
      setLoading(false);
    })().catch((err) => {
      // A rejected read used to escape unhandled, leaving
      // `loading` true forever: the screen showed its spinner
      // permanently with the real reason only in the console.
      setLoadError(err instanceof Error ? err.message : "Something went wrong loading this screen.");
      setLoading(false);
    });
  }, [profile?.schoolId, profile?.id]);

  const daySlots = grouped[day] ?? [];

  return (
    <AuthGuard allowRoles={["teacher"]}>
      <AppShell role="teacher">
        <PageHeader title="Schedule" showBack={false} />
        <div className="mb-5 flex gap-1.5 overflow-x-auto no-scrollbar">
          {WEEKDAYS.map((d) => (
            <button
              key={d}
              onClick={() => setDay(d)}
              className={cn("shrink-0 rounded-full px-4 py-2 text-xs font-medium", d === day ? "bg-white/12 text-ink" : "glass-surface text-ink-faint")}
            >
              {DAY_LABEL[d]}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : daySlots.length === 0 ? (
          <EmptyState icon={<CalendarClock className="h-5.5 w-5.5" />} title="Nothing scheduled" message="No classes on this day yet." />
        ) : (
          <div className="flex flex-col divide-y divide-white/6">
            {daySlots.map((s) => (
              <ListRow
                key={s.id}
                href={`/teacher/classes/${s.classId}`}
                title={s.subject}
                subtitle={`${classes.find((c) => c.id === s.classId)?.name ?? ""}${s.room ? ` · Room ${s.room}` : ""}`}
                trailing={<span className="text-xs font-semibold text-ink-muted">{s.startTime}</span>}
              />
            ))}
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}
