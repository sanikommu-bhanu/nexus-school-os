"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONE = {
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/12 text-danger",
  success: "bg-success/12 text-success",
  accent: "bg-accent/12 text-accent-soft",
};

export interface InsightAction {
  label: string;
  href: string;
}

/**
 * Every explainable insight is built from three real, honest parts —
 * no part is allowed to be a filler sentence:
 *   whatChanged   — the concrete before/after fact (a number, a delta)
 *   whyItMatters  — a plain-English consequence, grounded in the same fact
 *   whatCanIDo    — 1-2 concrete next steps, each a real link/action
 * this exists so "explainable AI" in this app means a real trail from
 * data to explanation, not a model asserting a conclusion with no basis.
 */
export function ExplainableInsightCard({
  icon,
  title,
  tone = "accent",
  whatChanged,
  whyItMatters,
  whatCanIDo,
}: {
  icon: ReactNode;
  title: string;
  tone?: keyof typeof TONE;
  whatChanged: string;
  whyItMatters: string;
  whatCanIDo?: InsightAction[];
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <div className="glass-surface rounded-2xl p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 text-left">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", TONE[tone])}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{whatChanged}</p>
        </div>
        <motion.div animate={reduceMotion ? undefined : { rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="mt-1 shrink-0">
          <ChevronDown className="h-4 w-4 text-ink-faint" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex flex-col gap-3 border-t border-white/8 pt-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">What changed</p>
                <p className="mt-0.5 text-xs text-ink-muted">{whatChanged}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Why it matters</p>
                <p className="mt-0.5 text-xs text-ink-muted">{whyItMatters}</p>
              </div>
              {whatCanIDo && whatCanIDo.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">What can I do</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {whatCanIDo.map((a) => (
                      <Link key={a.href} href={a.href} className="rounded-full bg-white/8 px-3 py-1.5 text-xs font-semibold text-ink active:scale-95 transition-transform">
                        {a.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
