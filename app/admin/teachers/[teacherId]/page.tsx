"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getTeacherProfile } from "@/services/teacher-service";
import { getUserProfiles } from "@/services/user-service";
import { getClassById } from "@/services/class-service";
import { getTeachersForSchool } from "@/services/teacher-service";
import { getCoverOptions } from "@/services/workload-service";
import { WEEKDAYS, type ClassEntity, type TeacherProfile, type UserProfile, type Weekday } from "@/types";
import { Layers, UserCheck } from "lucide-react";
import { Stat } from "@/components/ui/Stat";

const WEEKDAY_LABEL: Record<Weekday, string> = {
  MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat",
};

/** Today as a timetable weekday. Sunday has no teaching day, so it falls back to Monday. */
function todayWeekday(): Weekday {
  return WEEKDAYS[Math.max(0, new Date().getDay() - 1)] ?? "MO";
}

interface CoverOption {
  slotId: string;
  subject: string;
  period: number;
  available: string[];
}

export default function TeacherDetailPage() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const { profile } = useAuthUser();
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [classes, setClasses] = useState<ClassEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [day, setDay] = useState<Weekday>(todayWeekday);
  const [cover, setCover] = useState<CoverOption[] | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [staff, setStaff] = useState<Map<string, UserProfile>>(new Map());

  useEffect(() => {
    if (!profile?.schoolId || !teacherId) return;
    (async () => {
      const t = await getTeacherProfile(teacherId);
      if (!t) { setLoading(false); return; }
      const [u, classList, allTeachers] = await Promise.all([
        getUserProfiles([teacherId]),
        Promise.all(t.classIds.map((cid) => getClassById(profile.schoolId!, cid))),
        // Cover planning needs the whole staff list, not just this
        // teacher: the answer to "who is free?" is drawn from everyone
        // else. Swallowed so the profile still renders without it.
        getTeachersForSchool(profile.schoolId!).catch(() => []),
      ]);
      setTeacher(t);
      setUser(u.get(teacherId) ?? null);
      setClasses(classList.filter((c): c is ClassEntity => c !== null));
      if (allTeachers.length > 0) {
        setStaff(await getUserProfiles(allTeachers.map((x) => x.userId)).catch(() => new Map<string, UserProfile>()));
      }
      setLoading(false);
    })().catch((err) => {
      // A rejected read used to escape unhandled, leaving
      // `loading` true forever: the screen showed its spinner
      // permanently with the real reason only in the console.
      setLoadError(err instanceof Error ? err.message : "Something went wrong loading this screen.");
      setLoading(false);
    });
  }, [profile?.schoolId, teacherId]);

  // Cover options are recomputed per day rather than loaded once: the
  // question is "who can cover THIS day", and the answer is verified
  // against the same findConflicts engine the timetable screen uses,
  // so a name is only ever offered when that teacher is genuinely free.
  useEffect(() => {
    if (!profile?.schoolId || !teacherId || staff.size === 0) return;
    let cancelled = false;
    setCoverLoading(true);
    getCoverOptions(profile.schoolId, teacherId, day, Array.from(staff.keys()))
      .then((opts) => {
        if (!cancelled) setCover(opts);
      })
      .catch(() => {
        if (!cancelled) setCover([]);
      })
      .finally(() => {
        if (!cancelled) setCoverLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.schoolId, teacherId, day, staff]);

  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <PageHeader title="Teacher Profile" />
        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : !teacher || !user ? (
          <EmptyState title="Teacher not found" />
        ) : (
          <>
            <div className="flex flex-col items-center py-4 text-center">
              <Avatar name={user.fullName} src={user.photoURL} size="xl" />
              <h2 className="mt-3 text-lg font-bold text-ink">{user.fullName}</h2>
              <p className="text-sm text-ink-muted">{teacher.subject}{teacher.department ? ` · ${teacher.department}` : ""}</p>
            </div>

            <GlassSurface rounded="2xl" className="flex divide-x divide-white/8" padded={false}>
              <Stat size="xl" label="Classes" value={classes.length} />
              <Stat size="xl" label="Students" value={classes.reduce((a, c) => a + c.studentCount, 0)} />
            </GlassSurface>

            <div className="mt-6">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">Classes</p>
              {classes.length === 0 ? (
                <EmptyState icon={<Layers className="h-5.5 w-5.5" />} title="No classes yet" />
              ) : (
                <div className="flex flex-col divide-y divide-white/6">
                  {classes.map((c) => (
                    <ListRow
                      key={c.id}
                      href={`/admin/classes/${c.id}`}
                      title={c.name}
                      subtitle={`${c.subject} · ${c.studentCount} students`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/*
              Cover planning — the 8am question. findCoverOptions() and
              its 23 unit tests already existed and were correct; the
              service wrapper getCoverOptions() simply had no caller, so
              a verified feature was unreachable from the app.
            */}
            <div className="mt-6">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
                If absent, who can cover?
              </p>
              <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Day to plan cover for">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDay(d)}
                    aria-pressed={day === d}
                    className={
                      day === d
                        ? "rounded-full bg-accent/20 px-3.5 py-1.5 text-xs font-semibold text-accent-soft"
                        : "rounded-full glass-surface px-3.5 py-1.5 text-xs font-medium text-ink-muted"
                    }
                  >
                    {WEEKDAY_LABEL[d]}
                  </button>
                ))}
              </div>

              {coverLoading ? (
                <LoadingState />
              ) : !cover || cover.length === 0 ? (
                <EmptyState
                  icon={<UserCheck className="h-5.5 w-5.5" />}
                  title="No lessons that day"
                  message={`${user.fullName} isn't timetabled on ${WEEKDAY_LABEL[day]}, so no cover is needed.`}
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {cover.map((c) => (
                    <GlassSurface key={c.slotId} rounded="2xl" className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-ink">
                          Period {c.period} · {c.subject}
                        </p>
                        <span className="text-xs text-ink-faint">
                          {c.available.length} free
                        </span>
                      </div>
                      {c.available.length === 0 ? (
                        <p className="text-xs text-warning">
                          Nobody is free this period — this one needs a timetable change.
                        </p>
                      ) : (
                        <p className="text-xs text-ink-muted">
                          {c.available
                            .map((id) => staff.get(id)?.fullName ?? "Teacher")
                            .join(" · ")}
                        </p>
                      )}
                    </GlassSurface>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 text-sm text-ink-muted">
              <GlassSurface rounded="2xl" className="text-center">
                <p className="text-xs text-ink-faint">Email</p>
                <p className="mt-1 truncate text-ink">{user.email ?? "—"}</p>
              </GlassSurface>
              <GlassSurface rounded="2xl" className="text-center">
                <p className="text-xs text-ink-faint">Phone</p>
                <p className="mt-1 text-ink">{user.phone ?? "—"}</p>
              </GlassSurface>
            </div>
          </>
        )}
      </AppShell>
    </AuthGuard>
  );
}
