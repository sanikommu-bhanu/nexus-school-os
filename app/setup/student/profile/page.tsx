"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { useAuthUser } from "@/hooks/useAuthUser";
import { createStudentProfile } from "@/services/student-service";
import { joinClassAsStudent } from "@/services/class-service";

export default function StudentProfilePage() {
  return (
    <AuthGuard allowRoles={["student"]} requireOnboarded={false}>
      <StudentProfileContent />
    </AuthGuard>
  );
}

function StudentProfileContent() {
  const router = useRouter();
  const params = useSearchParams();
  const schoolId = params.get("schoolId") ?? "";
  const classId = params.get("classId") ?? "";
  const { user, profile } = useAuthUser();

  const [rollNumber, setRollNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = rollNumber.trim().length > 0 && dateOfBirth.trim().length > 0;

  const handleContinue = async () => {
    if (!canSubmit || !user || !schoolId || !classId) return;
    setStatus("loading");
    setError(null);
    try {
      await createStudentProfile(user.uid, schoolId, classId, { rollNumber, dateOfBirth, gender }, profile?.fullName ?? "Student");
      const { alreadyJoined } = await joinClassAsStudent(schoolId, classId, user.uid);
      void alreadyJoined; // idempotent — safe even on retry/duplicate scan
      router.push("/setup/student/parent-connect");
    } catch {
      setStatus("error");
      setError("We couldn't save your profile. Please try again.");
    }
  };

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame no-scrollbar overflow-y-auto pb-10">
        <PageHeader title="Tell us about yourself" showBack={false} />

        <div className="mb-6 flex justify-center">
          <Avatar name={profile?.fullName ?? "Student"} size="xl" />
        </div>

        <div className="flex flex-1 flex-col gap-4">
          <Input label="Full name" value={profile?.fullName ?? ""} disabled />
          <Input label="Roll number" placeholder="12" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
          <Input
            label="Date of birth"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-muted">Gender</label>
            <div className="flex gap-2">
              {["Male", "Female", "Other"].map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    gender === g ? "bg-action text-white" : "glass-surface text-ink-muted"
                  }`}
                >
                  {g}
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
