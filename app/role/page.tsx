"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldCheck, BookOpen, GraduationCap, Heart, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

const ROLES: { role: Role; label: string; description: string; icon: typeof ShieldCheck }[] = [
  { role: "admin", label: "Admin", description: "Manage your entire school", icon: ShieldCheck },
  { role: "teacher", label: "Teacher", description: "Teach & manage classes", icon: BookOpen },
  { role: "student", label: "Student", description: "Learn & track progress", icon: GraduationCap },
  { role: "parent", label: "Parent", description: "Stay connected with your child", icon: Heart },
];

export default function RoleSelectionPage() {
  const [selected, setSelected] = useState<Role | null>(null);
  const router = useRouter();

  const handleContinue = () => {
    if (!selected) return;
    router.push(`/auth?role=${selected}`);
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
          <Button onClick={handleContinue} disabled={!selected}>
            Continue
          </Button>
        </div>
      </div>
    </main>
  );
}
