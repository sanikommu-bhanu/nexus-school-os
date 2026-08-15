"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { QRDisplay } from "@/components/ui/QRDisplay";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/States";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getStudentProfile } from "@/services/student-service";
import { updateUserProfile } from "@/services/user-service";
import type { StudentProfile } from "@/types";

function ParentConnectContent() {
  const router = useRouter();
  const { user } = useAuthUser();
  const [student, setStudent] = useState<StudentProfile | null>(null);

  useEffect(() => {
    if (user) getStudentProfile(user.uid).then(setStudent);
  }, [user]);

  const handleContinue = async () => {
    if (!user) return;
    // Student's own setup is complete whether or not a parent has
    // linked yet — the link can happen any time from the parent's side.
    await updateUserProfile(user.uid, { onboardingComplete: true });
    router.replace("/student");
  };

  if (!student) {
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
          <QRDisplay
            value={`https://nexus.app/join/parent/${student.parentLinkCode}`}
            code={student.parentLinkCode}
            label="Parent Link Code"
          />
        </div>

        <div className="pb-10 pt-8">
          <Button onClick={handleContinue}>Continue</Button>
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
