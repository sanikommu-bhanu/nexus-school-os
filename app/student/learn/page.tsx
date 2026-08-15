"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { ListRow } from "@/components/ui/ListRow";
import { LoadingState, EmptyState } from "@/components/ui/States";
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
    })();
  }, [profile?.schoolId, profile?.id]);

  return (
    <AuthGuard allowRoles={["student"]}>
      <AppShell role="student">
        <PageHeader title="Learn" subtitle="Your classes" showBack={false} />
        {loading ? (
          <LoadingState />
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
