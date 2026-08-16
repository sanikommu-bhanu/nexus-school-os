"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuthUser } from "@/hooks/useAuthUser";
import { createClass } from "@/services/class-service";
import { attachClassToTeacher } from "@/services/teacher-service";

const SUBJECTS = ["Mathematics", "Science", "English", "History", "Geography", "Computer Science"];

function CreateClassContent() {
  const router = useRouter();
  const schoolId = useSearchParams().get("schoolId") ?? "";
  const { user } = useAuthUser();

  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = grade.trim().length > 0 && section.trim().length > 0;

  const handleCreate = async () => {
    if (!canSubmit || !user || !schoolId) return;
    setStatus("loading");
    setError(null);
    try {
      const name = `${grade}-${section.toUpperCase()}`;
      const created = await createClass(schoolId, user.uid, { name, grade, section: section.toUpperCase(), subject });
      // The class itself exists at this point. Attaching it to the
      // teacher's denormalized classIds is a convenience index, so it
      // must not be able to undo a successful creation — the
      // authoritative link is classes.teacherId, which is already written.
      await attachClassToTeacher(user.uid, created.id).catch((err) =>
        console.warn("Class created but couldn't attach it to the teacher profile", err)
      );
      router.push(`/setup/teacher/class-share?schoolId=${schoolId}&classId=${created.id}`);
    } catch (err) {
      setStatus("error");
      // "Please try again" was actively harmful here: retrying a
      // permission-denied fails identically every time, and the message
      // gave the teacher nothing to act on and no way to tell a
      // deployment problem from a typo.
      const code = (err as { code?: string })?.code;
      setError(
        code === "permission-denied"
          ? "You don't have permission to create a class in this school. Ask your admin to confirm you've joined with the school code and that the latest security rules are deployed."
          : `We couldn't create the class: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  };

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame">
        <PageHeader title="Create Class" subtitle="Add a new class" />

        <div className="flex flex-1 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Grade" placeholder="10" value={grade} onChange={(e) => setGrade(e.target.value)} />
            <Input label="Section" placeholder="A" value={section} onChange={(e) => setSection(e.target.value)} />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-muted">Subject</label>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSubject(s)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    subject === s ? "bg-action text-white" : "glass-surface text-ink-muted"
                  }`}
                >
                  {s}
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
            <Button onClick={handleCreate} disabled={!canSubmit} loading={status === "loading"}>
              Create Class
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function CreateClassPage() {
  return (
    <AuthGuard allowRoles={["teacher"]} requireOnboarded={false}>
      <CreateClassContent />
    </AuthGuard>
  );
}
