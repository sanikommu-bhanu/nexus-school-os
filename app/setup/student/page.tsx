"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { QRScanner } from "@/components/ui/QRScanner";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { Button } from "@/components/ui/Button";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getClassByCode } from "@/services/class-service";
import { getSchoolById } from "@/services/school-service";
import type { ClassEntity, School } from "@/types";

function extractCode(scanned: string): string {
  const parts = scanned.trim().split("/");
  return parts[parts.length - 1].toUpperCase();
}

interface Preview {
  classEntity: ClassEntity;
  school: School;
  teacherName: string;
}

function JoinClassContent() {
  const router = useRouter();
  const { user } = useAuthUser();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleResult = async (raw: string) => {
    if (checking) return;
    setChecking(true);
    setError(null);

    // Both lookups hit Firestore and can reject (offline, or a rules
    // deployment that doesn't yet authorise the collectionGroup query
    // behind getClassByCode). Unhandled, the rejection escaped and
    // `checking` was never cleared: the screen sat on "Checking code…"
    // permanently, with the real reason visible only in the console.
    try {
      const code = extractCode(raw);
      const classEntity = await getClassByCode(code);

      if (!classEntity) {
        setError("That class code isn't valid. Ask your teacher for the correct code.");
        return;
      }

      const school = await getSchoolById(classEntity.schoolId);

      if (!school) {
        setError("We couldn't find that class's school.");
        return;
      }

      setPreview({ classEntity, school, teacherName: classEntity.teacherName ?? "Teacher" });
    } catch (err) {
      setError(
        (err as { code?: string })?.code === "permission-denied"
          ? "We couldn't look up that class code. If this keeps happening, ask your school admin to confirm the latest security rules are deployed."
          : `We couldn't check that code: ${err instanceof Error ? err.message : "unknown error"}`
      );
    } finally {
      setChecking(false);
    }
  };

  const handleConfirm = () => {
    if (!preview || !user) return;
    router.push(
      `/setup/student/profile?schoolId=${preview.school.id}&classId=${preview.classEntity.id}`
    );
  };

  if (preview) {
    return (
      <main className="nexus-atmosphere">
        <div className="screen-frame">
          <PageHeader title="Confirm your class" onBack={() => setPreview(null)} />

          <GlassSurface rounded="3xl" className="flex flex-col gap-1 divide-y divide-white/8">
            {[
              ["School", preview.school.name],
              ["Class", preview.classEntity.name],
              ["Section", preview.classEntity.section],
              ["Teacher", preview.teacherName],
              ["Subject", preview.classEntity.subject],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <span className="text-sm text-ink-muted">{label}</span>
                <span className="text-sm font-semibold text-ink">{value}</span>
              </div>
            ))}
          </GlassSurface>

          <div className="mt-auto pb-10 pt-8">
            <Button onClick={handleConfirm}>Confirm & Continue</Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame">
        <PageHeader title="Student Join" subtitle="Enter class code or scan QR" showBack={false} />

        <div className="flex flex-1 flex-col items-center justify-center">
          <QRScanner onResult={handleResult} manualPlaceholder="NX10A-MATH-42" />
          {checking && <p className="mt-4 text-sm text-ink-muted">Checking code…</p>}
          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function JoinClassPage() {
  return (
    <AuthGuard allowRoles={["student"]} requireOnboarded={false}>
      <JoinClassContent />
    </AuthGuard>
  );
}
