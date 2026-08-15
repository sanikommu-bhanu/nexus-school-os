"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { useAuthUser } from "@/hooks/useAuthUser";
import { updateUserProfile } from "@/services/user-service";

function ParentProfileContent() {
  const router = useRouter();
  const { user, profile } = useAuthUser();
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!user) return;
    setStatus("loading");
    setError(null);
    try {
      if (phone.trim()) await updateUserProfile(user.uid, { phone: phone.trim() });
      router.push("/setup/parent/connect-child");
    } catch {
      setStatus("error");
      setError("Something went wrong. Please try again.");
    }
  };

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame">
        <PageHeader title="Tell us about yourself" showBack={false} />

        <div className="mb-6 flex justify-center">
          <Avatar name={profile?.fullName ?? "Parent"} size="xl" />
        </div>

        <div className="flex flex-1 flex-col gap-4">
          <Input label="Full name" value={profile?.fullName ?? ""} disabled />
          <Input label="Phone number (optional)" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />

          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-auto pt-6">
            <Button onClick={handleContinue} loading={status === "loading"}>
              Continue
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ParentProfilePage() {
  return (
    <AuthGuard allowRoles={["parent"]} requireOnboarded={false}>
      <ParentProfileContent />
    </AuthGuard>
  );
}
