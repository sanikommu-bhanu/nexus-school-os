"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, School as SchoolIcon } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { GlassSurface } from "@/components/ui/GlassSurface";
import { useAuthUser } from "@/hooks/useAuthUser";
import { getSchoolById } from "@/services/school-service";
import { createTeacherProfile } from "@/services/teacher-service";
import type { School } from "@/types";

const DEPARTMENTS = ["Science", "Mathematics", "Languages", "Humanities", "Arts", "Sports", "Other"];

function TeacherProfileContent() {
  const router = useRouter();
  const schoolId = useSearchParams().get("schoolId") ?? "";
  const { user, profile } = useAuthUser();
  const [school, setSchool] = useState<School | null>(null);

  const [subject, setSubject] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (schoolId) getSchoolById(schoolId).then(setSchool);
  }, [schoolId]);

  const canSubmit = subject.trim().length > 1;

  const handleContinue = async () => {
    if (!canSubmit || !user || !schoolId) return;
    setStatus("loading");
    setError(null);
    try {
      await createTeacherProfile(user.uid, schoolId, { subject, department });
      router.push(`/setup/teacher/create-class?schoolId=${schoolId}`);
    } catch {
      setStatus("error");
      setError("We couldn't save your profile. Please try again.");
    }
  };

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame no-scrollbar overflow-y-auto pb-10">
        <PageHeader title="Tell us about yourself" showBack={false} />

        {school && (
          <GlassSurface rounded="2xl" className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15">
              <SchoolIcon className="h-5 w-5 text-accent-soft" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">{school.name}</p>
              <p className="text-xs text-ink-muted">Joining as Teacher</p>
            </div>
          </GlassSurface>
        )}

        <div className="flex flex-1 flex-col gap-4">
          <Input label="Full name" value={profile?.fullName ?? ""} disabled />
          <Input label="Subject" placeholder="Mathematics" value={subject} onChange={(e) => setSubject(e.target.value)} />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-muted">Department</label>
            <div className="flex flex-wrap gap-2">
              {DEPARTMENTS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDepartment(d)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    department === d ? "bg-action text-white" : "glass-surface text-ink-muted"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-auto pt-6">
            <Button onClick={handleContinue} disabled={!canSubmit} loading={status === "loading"}>
              Continue
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function TeacherProfilePage() {
  return (
    <AuthGuard allowRoles={["teacher"]} requireOnboarded={false}>
      <TeacherProfileContent />
    </AuthGuard>
  );
}
