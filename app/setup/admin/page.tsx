"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Building2 } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuthUser } from "@/hooks/useAuthUser";
import { createSchool } from "@/services/school-service";
import { updateUserProfile } from "@/services/user-service";

const SCHOOL_TYPES = ["CBSE", "ICSE", "State Board", "IB", "International", "Other"];

function CreateSchoolForm() {
  const router = useRouter();
  const { user } = useAuthUser();

  const [name, setName] = useState("");
  const [type, setType] = useState(SCHOOL_TYPES[0]);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 1 && city.trim().length > 0 && state.trim().length > 0;

  const handleCreate = async () => {
    if (!canSubmit || !user) return;
    setStatus("loading");
    setError(null);
    try {
      const school = await createSchool(user.uid, { name, type, city, state });
      await updateUserProfile(user.uid, { schoolId: school.id, onboardingComplete: true });
      router.push(`/setup/admin/success?schoolId=${school.id}`);
    } catch (err) {
      setStatus("error");
      setError("We couldn't create your school. Please try again.");
    }
  };

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame no-scrollbar overflow-y-auto pb-10">
        <PageHeader title="Create your school" subtitle="Let's set things up" showBack={false} />

        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl glass-surface">
            <Building2 className="h-7 w-7 text-accent-soft" strokeWidth={1.5} />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4">
          <Input label="School name" placeholder="NEXUS International School" value={name} onChange={(e) => setName(e.target.value)} />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-muted">School type</label>
            <div className="flex flex-wrap gap-2">
              {SCHOOL_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    type === t ? "bg-action text-white" : "glass-surface text-ink-muted"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="City" placeholder="Bangalore" value={city} onChange={(e) => setCity(e.target.value)} />
            <Input label="State" placeholder="Karnataka" value={state} onChange={(e) => setState(e.target.value)} />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-auto pt-6">
            <Button onClick={handleCreate} disabled={!canSubmit} loading={status === "loading"}>
              Create School
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function CreateSchoolPage() {
  return (
    <AuthGuard allowRoles={["admin"]} requireOnboarded={false}>
      <CreateSchoolForm />
    </AuthGuard>
  );
}
