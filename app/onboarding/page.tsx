"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { GraduationCap, Users2, Sparkles } from "lucide-react";
import { ProgressDots } from "@/components/ui/ProgressDots";
import { Button } from "@/components/ui/Button";

const STEPS = [
  {
    icon: GraduationCap,
    title: "Smarter Schools,\nStronger Futures.",
    body: "NEXUS connects academics, administration and student life into one intelligent platform.",
  },
  {
    icon: Users2,
    title: "Everything\nConnected.",
    body: "Bring teachers, students, parents and administrators together — on the same data, in real time.",
  },
  {
    icon: Sparkles,
    title: "Insights That\nInspire Action.",
    body: "NEXUS surfaces what needs attention, so every role can understand, decide and act faster.",
  },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const isLast = step === STEPS.length - 1;
  const Icon = STEPS[step].icon;

  const next = () => (isLast ? router.push("/role") : setStep((s) => s + 1));

  return (
    <main className="nexus-atmosphere">
      <div className="screen-frame">
        <div className="flex items-center justify-between pt-6">
          <ProgressDots total={STEPS.length} current={step} />
          {!isLast && (
            <button
              onClick={() => router.push("/role")}
              className="text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              Skip
            </button>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex w-full flex-col items-center text-center"
            >
              <div className="relative mb-10 flex h-44 w-44 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-accent/25 to-action/20 blur-xl" />
                <div className="relative flex h-32 w-32 items-center justify-center rounded-[2rem] glass-surface">
                  <Icon className="h-12 w-12 text-accent-soft" strokeWidth={1.5} />
                </div>
              </div>

              <h2 className="whitespace-pre-line text-2xl font-bold leading-snug text-ink">
                {STEPS[step].title}
              </h2>
              <p className="mt-3 max-w-[300px] text-sm leading-relaxed text-ink-muted">
                {STEPS[step].body}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="pb-10">
          <Button onClick={next}>{isLast ? "Get Started" : "Next"}</Button>
        </div>
      </div>
    </main>
  );
}
