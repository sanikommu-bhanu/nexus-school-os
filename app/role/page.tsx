"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldCheck, BookOpen, GraduationCap, Heart, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useAuthUser } from "@/hooks/useAuthUser";
import { ensureUserProfile } from "@/services/user-service";
import { publishAuthProfile } from "@/hooks/useAuthUser";
import type { Role } from "@/types";

const ROLES: { role: Role; label: string; description: string; icon: typeof ShieldCheck }[] = [
  { role: "admin", label: "Admin", description: "Manage your entire school", icon: ShieldCheck },
  { role: "teacher", label: "Teacher", description: "Teach & manage classes", icon: BookOpen },
  { role: "student", label: "Student", description: "Learn & track progress", icon: GraduationCap },
  { role: "parent", label: "Parent", description: "Stay connected with your child", icon: Heart },
];

export default function RoleSelectionPage() {
  const [selected, setSelected] = useState<Role | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { user, profile, loading } = useAuthUser();

  const handleContinue = async () => {
    if (!selected) return;

    // Not signed in yet — the normal path: pick a role, then authenticate.
    if (!user) {
      router.push(`/auth?role=${selected}`);
      return;
    }

    // Signed in already. If a profile exists, honour its role (role is
    // immutable from the client per firestore.rules) and just resume.
    if (profile) {
      router.replace(profile.onboardingComplete ? `/${profile.role}` : `/setup/${profile.role}`);
      return;
    }

    // Signed in with no profile doc — this is where every guard sends a
    // half-created account. Write the profile here so the loop ends,
    // instead of pushing back to /auth for a sign-in they've already done.
    setSubmitting(true);
    setError(null);
    try {
      const created = await ensureUserProfile(user.uid, {
        fullName: user.displayName ?? "",
        email: user.email,
        photoURL: user.photoURL ?? undefined,
        role: selected,
      });
      publishAuthProfile(created);
      router.replace(`/setup/${created.role}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Couldn't save your profile: ${err.message}`
          : "Couldn't save your profile. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame">
        <div className="pb-8 pt-10">
          <h1 className="text-2xl font-bold text-ink">Choose your role</h1>
          <p className="mt-1.5 text-sm text-ink-muted">Select how you&apos;ll use NEXUS</p>
        </div>

        <div className="flex flex-1 flex-col gap-3">
          {ROLES.map(({ role, label, description, icon: Icon }, i) => {
            const isSelected = selected === role;
            return (
              <motion.button
                key={role}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
                onClick={() => setSelected(role)}
                className={cn(
                  "glass-surface flex items-center gap-4 rounded-2xl p-4 text-left transition-all",
                  isSelected && "border-action/50 shadow-glow-pink"
                )}
              >
                <div
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-colors",
                    isSelected ? "bg-action/20" : "bg-accent/15"
                  )}
                >
                  <Icon className={cn("h-5.5 w-5.5", isSelected ? "text-action" : "text-accent-soft")} strokeWidth={1.75} />
                </div>
                <div className="flex-1">
                  <p className="text-base font-semibold text-ink">{label}</p>
                  <p className="text-sm text-ink-muted">{description}</p>
                </div>
                <div
                  className={cn(
                    "flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full border transition-all",
                    isSelected ? "border-action bg-action" : "border-white/20"
                  )}
                >
                  {isSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                </div>
              </motion.button>
            );
          })}
        </div>

        <div className="pb-10 pt-6">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Button onClick={handleContinue} disabled={!selected || loading} loading={submitting}>
            Continue
          </Button>
        </div>
      </div>
    </main>
  );
}
