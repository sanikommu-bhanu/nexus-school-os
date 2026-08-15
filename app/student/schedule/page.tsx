"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState } from "@/components/ui/States";
import { cn } from "@/lib/utils";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getStudentProfile } from "@/services/student-service";
import { getTimetableForClass, groupByDay } from "@/services/timetable-service";
import type { TimetableSlot, Weekday } from "@/types";
import { WEEKDAYS } from "@/types";
import { CalendarClock } from "lucide-react";

const DAY_LABEL: Record<Weekday, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };

export default function StudentSchedulePage() {
  const { profile } = useAuthUser();
  const [grouped, setGrouped] = useState<Record<Weekday, TimetableSlot[]>>({} as any);
  const [day, setDay] = useState<Weekday>(WEEKDAYS[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.schoolId || !profile.id) return;
    (async () => {
      const student = await getStudentProfile(profile.id);
      if (!student) { setLoading(false); return; }
      const slots = await getTimetableForClass(profile.schoolId!, student.classId);
      setGrouped(groupByDay(slots));
      const todayIdx = new Date().getDay();
      setDay(WEEKDAYS[Math.max(0, todayIdx - 1) % WEEKDAYS.length]);
      setLoading(false);
    })();
  }, [profile?.schoolId, profile?.id]);

  const daySlots = grouped[day] ?? [];

  return (
    <AuthGuard allowRoles={["student"]}>
      <AppShell role="student">
        <PageHeader title="Schedule" showBack={false} />
        <div className="mb-5 flex gap-1.5 overflow-x-auto no-scrollbar">
          {WEEKDAYS.map((d) => (
            <button key={d} onClick={() => setDay(d)} className={cn("shrink-0 rounded-full px-4 py-2 text-xs font-medium", d === day ? "bg-white/12 text-ink" : "glass-surface text-ink-faint")}>
              {DAY_LABEL[d]}
            </button>
          ))}
        </div>
        {loading ? (
          <LoadingState />
        ) : daySlots.length === 0 ? (
          <EmptyState icon={<CalendarClock className="h-5.5 w-5.5" />} title="Nothing scheduled" />
        ) : (
          <div className="flex flex-col divide-y divide-white/6">
            {daySlots.map((s) => (
              <ListRow key={s.id} title={s.subject} subtitle={s.room ? `Room ${s.room}` : undefined} trailing={<span className="text-xs font-semibold text-ink-muted">{s.startTime}</span>} />
            ))}
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}
