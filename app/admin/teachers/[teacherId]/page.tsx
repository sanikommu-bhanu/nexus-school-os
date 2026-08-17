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
import type { ClassEntity, TeacherProfile, UserProfile } from "@/types";
import { Layers } from "lucide-react";
import { Stat } from "@/components/ui/Stat";

export default function TeacherDetailPage() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const { profile } = useAuthUser();
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [classes, setClasses] = useState<ClassEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.schoolId || !teacherId) return;
    (async () => {
      const t = await getTeacherProfile(teacherId);
      if (!t) { setLoading(false); return; }
      const [u, classList] = await Promise.all([
        getUserProfiles([teacherId]),
        Promise.all(t.classIds.map((cid) => getClassById(profile.schoolId!, cid))),
      ]);
      setTeacher(t);
      setUser(u.get(teacherId) ?? null);
      setClasses(classList.filter((c): c is ClassEntity => c !== null));
      setLoading(false);
    })().catch((err) => {
      // A rejected read used to escape unhandled, leaving
      // `loading` true forever: the screen showed its spinner
      // permanently with the real reason only in the console.
      setLoadError(err instanceof Error ? err.message : "Something went wrong loading this screen.");
      setLoading(false);
    });
  }, [profile?.schoolId, teacherId]);

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
