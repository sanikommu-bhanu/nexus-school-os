"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getStudentsForSchool } from "@/services/student-service";
import { getClassesForSchool } from "@/services/class-service";
import { getUserProfiles } from "@/services/user-service";
import { Search, GraduationCap } from "lucide-react";
import type { ClassEntity, StudentProfile, UserProfile } from "@/types";

export default function AdminStudentsPage() {
  const { profile } = useAuthUser();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [users, setUsers] = useState<Map<string, UserProfile>>(new Map());
  const [classes, setClasses] = useState<Map<string, ClassEntity>>(new Map());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [classFilter, setClassFilter] = useState("");

  useEffect(() => {
    if (!profile?.schoolId) return;
    (async () => {
      const [s, c] = await Promise.all([getStudentsForSchool(profile.schoolId!), getClassesForSchool(profile.schoolId!)]);
      const u = await getUserProfiles(s.map((x) => x.userId));
      setStudents(s);
      setUsers(u);
      setClasses(new Map(c.map((cl) => [cl.id, cl])));
      setLoading(false);
    })();
  }, [profile?.schoolId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return students.filter((s) => {
      const name = users.get(s.userId)?.fullName ?? "";
      const matchesTerm = !term || name.toLowerCase().includes(term) || (s.rollNumber ?? "").toLowerCase().includes(term);
      const matchesClass = !classFilter || s.classId === classFilter;
      return matchesTerm && matchesClass;
    });
  }, [students, users, q, classFilter]);

  return (
    <AuthGuard allowRoles={["admin"]}>
      <AppShell role="admin">
        <PageHeader title="Students" subtitle={`${students.length} total`} />

        <div className="flex flex-col gap-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students…" trailing={<Search className="h-4 w-4" />} />
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="input-glass">
            <option value="">All classes</option>
            {Array.from(classes.values()).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-col divide-y divide-white/6">
          {loading ? (
            <LoadingState />
          ) : filtered.length === 0 ? (
            <EmptyState icon={<GraduationCap className="h-5.5 w-5.5" />} title="No students found" />
          ) : (
            filtered.map((s) => {
              const u = users.get(s.userId);
              const c = classes.get(s.classId);
              return (
                <ListRow
                  key={s.userId}
                  href={`/admin/students/${s.userId}`}
                  leading={<Avatar name={u?.fullName ?? "Student"} src={u?.photoURL} />}
                  title={u?.fullName ?? "Student"}
                  subtitle={c ? `${c.name} · Roll ${s.rollNumber ?? "—"}` : undefined}
                  trailing={c && <Badge tone="accent">{c.name}</Badge>}
                />
              );
            })
          )}
        </div>
      </AppShell>
    </AuthGuard>
  );
}
