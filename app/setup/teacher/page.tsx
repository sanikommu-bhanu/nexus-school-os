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
  const [showHelp, setShowHelp] = useState(false);

  const handleResult = async (raw: string) => {
    if (!user || checking) return;
    setChecking(true);
    setError(null);

    // Every step here talks to Firestore and can reject. Without this
    // try/catch a failure escaped as an unhandled rejection: `checking`
    // was never cleared, so the screen sat on "Checking code…" forever
    // with nothing on it explaining why — the error only existed in the
    // console.
    try {
      const code = extractCode(raw);
      const school = await getSchoolByCode(code);

      if (!school) {
        setError("That school code isn't valid. Double-check with your admin.");
        return;
      }

      // alreadyMember is not an error — either way the teacher moves on,
      // and no duplicate membership record is created.
      await addSchoolMember(school.id, user.uid, "teacher");
      router.push(`/setup/teacher/profile?schoolId=${school.id}`);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      setError(
        code === "permission-denied"
          ? "You don't have permission to join this school. If this keeps happening, ask your admin to confirm the school code and that the latest security rules are deployed."
          : `We couldn't join that school: ${err instanceof Error ? err.message : "unknown error"}`
      );
    } finally {
      setChecking(false);
    }
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

        {/* This used to push to /auth — a sign-in screen is not "help",
            and with no role param it announces "Signing in as student" to
            a teacher who is already signed in and halfway through setup.
            The answer to "don't have a code" is who to ask for one. */}
        <div className="pb-10 text-center text-sm text-ink-muted">
          Don&apos;t have a code?{" "}
          <button className="font-semibold text-accent-soft" onClick={() => setShowHelp((v) => !v)}>
            Need help?
          </button>
          {showHelp && (
            <p className="mx-auto mt-3 max-w-[280px] text-xs text-ink-faint">
              Your school code is created by your admin when they set up the school — it looks like{" "}
              <span className="font-semibold text-ink-muted">SCH-7F82K91</span>. Ask them to share the code or the
              QR from their School screen.
            </p>
          )}
        </div>
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
