"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { QRScanner } from "@/components/ui/QRScanner";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getSchoolByCode, addSchoolMember } from "@/services/school-service";

function extractCode(scanned: string): string {
  // Accept either a raw code or a deep link like https://nexus.app/join/school/SCH-7F82K91
  const parts = scanned.trim().split("/");
  return parts[parts.length - 1].toUpperCase();
}

function JoinSchoolContent() {
  const router = useRouter();
  const { user } = useAuthUser();
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleResult = async (raw: string) => {
    if (!user || checking) return;
    setChecking(true);
    setError(null);

    const code = extractCode(raw);
    const school = await getSchoolByCode(code);

    if (!school) {
      setError("That school code isn't valid. Double-check with your admin.");
      setChecking(false);
      return;
    }

    const { alreadyMember } = await addSchoolMember(school.id, user.uid, "teacher");
    if (alreadyMember) {
      // Not an error — just move them forward, no duplicate record created.
      router.push(`/setup/teacher/profile?schoolId=${school.id}`);
      return;
    }

    router.push(`/setup/teacher/profile?schoolId=${school.id}`);
  };

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame">
        <PageHeader title="Join your school" subtitle="Enter school code or scan QR" showBack={false} />

        <div className="flex flex-1 flex-col items-center justify-center">
          <QRScanner onResult={handleResult} manualPlaceholder="SCH-7F82K91" />
          {checking && <p className="mt-4 text-sm text-ink-muted">Checking code…</p>}
          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <p className="pb-10 text-center text-sm text-ink-muted">
          Don&apos;t have a code?{" "}
          <button className="font-semibold text-accent-soft" onClick={() => router.push("/auth")}>
            Need help?
          </button>
        </p>
      </div>
    </main>
  );
}

export default function JoinSchoolPage() {
  return (
    <AuthGuard allowRoles={["teacher"]} requireOnboarded={false}>
      <JoinSchoolContent />
    </AuthGuard>
  );
}
