"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getStudentProfile } from "@/services/student-service";
import { getClassById } from "@/services/class-service";
import { getTeacherProfile } from "@/services/teacher-service";
import { getUserProfiles } from "@/services/user-service";
import type { ClassEntity } from "@/types";
import { BookOpen } from "lucide-react";

export default function StudentLearnPage() {
  const { profile } = useAuthUser();
  const [classes, setClasses] = useState<{ cls: ClassEntity; teacherName?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.schoolId || !profile.id) return;
    (async () => {
      const student = await getStudentProfile(profile.id);
      if (!student) { setLoading(false); return; }
      const cls = await getClassById(profile.schoolId!, student.classId);
      if (!cls) { setLoading(false); return; }
      const teacher = await getTeacherProfile(cls.teacherId);
      const users = teacher ? await getUserProfiles([teacher.userId]) : new Map();
      setClasses([{ cls, teacherName: teacher ? users.get(teacher.userId)?.fullName : undefined }]);
      setLoading(false);
    })().catch((err) => {
      // A rejected read used to escape unhandled, leaving
      // `loading` true forever: the screen showed its spinner
      // permanently with the real reason only in the console.
      setLoadError(err instanceof Error ? err.message : "Something went wrong loading this screen.");
      setLoading(false);
    });
  }, [profile?.schoolId, profile?.id]);

  return (
    <AuthGuard allowRoles={["student"]}>
      <AppShell role="student">
        <PageHeader title="Learn" subtitle="Your classes" showBack={false} />
        {loading ? (
          <LoadingState />
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => window.location.reload()} />
        ) : classes.length === 0 ? (
          <EmptyState icon={<BookOpen className="h-5.5 w-5.5" />} title="No classes yet" message="Join a class with a code or QR from setup." />
        ) : (
          <div className="flex flex-col divide-y divide-white/6">
            {classes.map(({ cls, teacherName }) => (
              <ListRow key={cls.id} href={`/student/learn/${cls.id}`} title={cls.name} subtitle={`${cls.subject}${teacherName ? ` · ${teacherName}` : ""}`} />
            ))}
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}
