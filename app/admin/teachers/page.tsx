"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getTeachersForSchool } from "@/services/teacher-service";
import { getClassesForSchool } from "@/services/class-service";
import { getUserProfiles } from "@/services/user-service";
import { Search, GraduationCap } from "lucide-react";
import type { ClassEntity, TeacherProfile, UserProfile } from "@/types";

export default function AdminTeachersPage() {
  const { profile } = useAuthUser();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [users, setUsers] = useState<Map<string, UserProfile>>(new Map());
  const [classes, setClasses] = useState<ClassEntity[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!profile?.schoolId) return;
    (async () => {
      const [t, c] = await Promise.all([getTeachersForSchool(profile.schoolId!), getClassesForSchool(profile.schoolId!)]);
      const u = await getUserProfiles(t.map((x) => x.userId));
      setTeachers(t);
      setClasses(c);
      setUsers(u);
      setLoading(false);
    })().catch((err) => {
      // A rejected read used to escape unhandled, leaving
      // `loading` true forever: the screen showed its spinner
      // permanently with the real reason only in the console.
      setLoadError(err instanceof Error ? err.message : "Something went wrong loading this screen.");
      setLoading(false);
    });
  }, [profile?.schoolId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return teachers;
    return teachers.filter((t) => (users.get(t.userId)?.fullName ?? "").toLowerCase().includes(term) || t.subject.toLowerCase().includes(term));
  }, [teachers, users, q]);

  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <PageHeader title="Teachers" subtitle="All teaching staff" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teachers…" trailing={<Search className="h-4 w-4" />} />

        <div className="mt-4 flex flex-col divide-y divide-white/6">
          {loading ? (
            <LoadingState />
          ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : filtered.length === 0 ? (
            <EmptyState icon={<GraduationCap className="h-5.5 w-5.5" />} title="No teachers found" message="Invite teachers to join with your school code." />
          ) : (
            filtered.map((t) => {
              const u = users.get(t.userId);
              const classNames = classes.filter((c) => t.classIds.includes(c.id)).map((c) => c.name);
              return (
                <ListRow
                  key={t.userId}
                  href={`/admin/teachers/${t.userId}`}
                  leading={<Avatar name={u?.fullName ?? "Teacher"} src={u?.photoURL} />}
                  title={u?.fullName ?? "Teacher"}
                  subtitle={t.subject}
                  trailing={
                    classNames.length > 0 ? (
                      <Badge tone="accent">{classNames.length} {classNames.length === 1 ? "class" : "classes"}</Badge>
                    ) : (
                      <Badge>No classes</Badge>
                    )
                  }
                />
              );
            })
          )}
        </div>
      </AppShell>
    </AuthGuard>
  );
}
