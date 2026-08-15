"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getClassesForTeacher } from "@/services/class-service";
import type { ClassEntity } from "@/types";
import { Layers } from "lucide-react";

export default function TeacherClassesPage() {
  const { profile } = useAuthUser();
  const [classes, setClasses] = useState<ClassEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.schoolId) return;
    getClassesForTeacher(profile.schoolId, profile.id).then((c) => {
      setClasses(c);
      setLoading(false);
    });
  }, [profile?.schoolId, profile?.id]);

  return (
    <AuthGuard allowRoles={["teacher"]}>
      <AppShell role="teacher">
        <PageHeader title="Classes" subtitle={`${classes.length} total`} showBack={false} />
        {loading ? (
          <LoadingState />
        ) : classes.length === 0 ? (
          <EmptyState icon={<Layers className="h-5.5 w-5.5" />} title="No classes yet" message="Create a class from setup to get started." />
        ) : (
          <div className="flex flex-col divide-y divide-white/6">
            {classes.map((c) => (
              <ListRow key={c.id} href={`/teacher/classes/${c.id}`} title={c.name} subtitle={`${c.subject} · ${c.studentCount} students`} />
            ))}
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}
