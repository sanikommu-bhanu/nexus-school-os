"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { QRDisplay } from "@/components/ui/QRDisplay";
import { Button } from "@/components/ui/Button";
import { LoadingState, EmptyState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getStudentProfile } from "@/services/student-service";
import { updateUserProfile } from "@/services/user-service";
import type { StudentProfile } from "@/types";

function ParentConnectContent() {
  const router = useRouter();
  const { user } = useAuthUser();
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [resolved, setResolved] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // `resolved` is tracked separately from `student` because the spinner
    // below keyed off `student` alone: a rejected read (no catch) or a
    // genuinely missing profile both left it null forever, so the student
    // was stuck on "Preparing your invite code…" at the LAST step of
    // onboarding with no way to finish. Now the screen always resolves,
    // and the Continue button — which is what actually completes
    // onboarding — is reachable either way.
    getStudentProfile(user.uid)
      .then(setStudent)
      .catch(() => setStudent(null))
      .finally(() => setResolved(true));
  }, [user]);

  const handleContinue = async () => {
    if (!user) return;
    setFinishing(true);
    setFinishError(null);
    try {
      // Student's own setup is complete whether or not a parent has
      // linked yet — the link can happen any time from the parent's side.
      await updateUserProfile(user.uid, { onboardingComplete: true });
      router.replace("/student");
    } catch (err) {
      // This write is what flips onboardingComplete, so a silent failure
      // here left the final button of student onboarding looking simply
      // dead — tap, nothing happens, no explanation.
      setFinishError(
        err instanceof Error ? `Couldn't finish setting up: ${err.message}` : "Couldn't finish setting up. Please try again."
      );
      setFinishing(false);
    }
  };

  if (!resolved) {
    return (
      <main className="nexus-atmosphere flex min-h-dvh items-center justify-center">
        <LoadingState message="Preparing your invite code…" />
      </main>
    );
  }

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame">
        <PageHeader title="Connect your parent" subtitle="Share this code or QR with your parent" showBack={false} />

        <div className="flex flex-1 flex-col items-center justify-center">
          {student ? (
            <QRDisplay
              value={`https://nexus.app/join/parent/${student.parentLinkCode}`}
              code={student.parentLinkCode}
              label="Parent Link Code"
            />
          ) : (
            <EmptyState
              title="Your invite code isn't ready yet"
              message="You can finish setting up now — your parent can connect later from your profile."
            />
          )}
        </div>

        <div className="pb-10 pt-8">
          {finishError && <p className="mb-2 text-center text-sm font-medium text-danger">{finishError}</p>}
          <Button onClick={handleContinue} loading={finishing}>
            Continue
          </Button>
        </div>
      </div>
    </main>
  );
}

export default function ParentConnectPage() {
  return (
    <AuthGuard allowRoles={["student"]} requireOnboarded={false}>
      <ParentConnectContent />
    </AuthGuard>
  );
}
