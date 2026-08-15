"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { ConnectionSuccess } from "@/components/ui/ConnectionSuccess";
import { QRDisplay } from "@/components/ui/QRDisplay";
import { LoadingState } from "@/components/ui/States";
import { getClassById } from "@/services/class-service";
import type { ClassEntity } from "@/types";

function ClassShareContent() {
  const router = useRouter();
  const params = useSearchParams();
  const schoolId = params.get("schoolId") ?? "";
  const classId = params.get("classId") ?? "";

  const [classEntity, setClassEntity] = useState<ClassEntity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId || !classId) return;
    getClassById(schoolId, classId).then((c) => {
      setClassEntity(c);
      setLoading(false);
    });
  }, [schoolId, classId]);

  if (loading) {
    return (
      <main className="nexus-atmosphere flex min-h-dvh items-center justify-center">
        <LoadingState message="Setting up your class…" />
      </main>
    );
  }

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame">
        <ConnectionSuccess
          heading={classEntity ? `${classEntity.name} · ${classEntity.subject}` : "Class created"}
          subheading="created successfully"
          ctaLabel="Done"
          onContinue={() => router.replace("/teacher")}
          secondary={
            classEntity && (
              <div className="mt-6 flex justify-center">
                <QRDisplay
                  value={`https://nexus.app/join/class/${classEntity.code}`}
                  code={classEntity.code}
                  label="Class Code"
                />
              </div>
            )
          }
        />
      </div>
    </main>
  );
}

export default function ClassSharePage() {
  return (
    <AuthGuard allowRoles={["teacher"]} requireOnboarded={false}>
      <ClassShareContent />
    </AuthGuard>
  );
}
