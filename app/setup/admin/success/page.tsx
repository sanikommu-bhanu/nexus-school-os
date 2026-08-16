"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { ConnectionSuccess } from "@/components/ui/ConnectionSuccess";
import { QRDisplay } from "@/components/ui/QRDisplay";
import { LoadingState } from "@/components/ui/States";
import { getSchoolById } from "@/services/school-service";
import type { School } from "@/types";

function SchoolSuccessContent() {
  const router = useRouter();
  const schoolId = useSearchParams().get("schoolId");
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Same two hangs as the teacher class-share screen: arriving with no
    // schoolId param never cleared `loading`, and a rejected read had no
    // catch — either way the admin sat on "Setting up your school…"
    // forever. The school is already created by the time this screen
    // renders, so neither case should trap them: fall through to the
    // success screen, which degrades to no QR block without the doc.
    if (!schoolId) {
      setLoading(false);
      return;
    }
    getSchoolById(schoolId)
      .then(setSchool)
      .catch(() => setSchool(null))
      .finally(() => setLoading(false));
  }, [schoolId]);

  if (loading) {
    return (
      <main className="nexus-atmosphere flex min-h-dvh items-center justify-center">
        <LoadingState message="Setting up your school…" />
      </main>
    );
  }

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame">
        <ConnectionSuccess
          heading="Your school is ready."
          subheading="Share this code so teachers can join."
          ctaLabel="Go to Dashboard"
          onContinue={() => router.replace("/admin")}
          secondary={
            school && (
              <div className="mt-6 flex justify-center">
                <QRDisplay
                  value={`https://nexus.app/join/school/${school.code}`}
                  code={school.code}
                  label={school.name}
                />
              </div>
            )
          }
        />
      </div>
    </main>
  );
}

export default function SchoolSuccessPage() {
  return (
    <AuthGuard allowRoles={["admin"]} requireOnboarded={false}>
      <SchoolSuccessContent />
    </AuthGuard>
  );
}
