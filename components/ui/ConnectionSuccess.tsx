"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { ReactNode } from "react";
import { Button } from "./Button";

interface ConnectionSuccessProps {
  heading: string;
  subheading?: string;
  /** Key details shown in a glass summary card, e.g. School Name / School ID */
  details?: { label: string; value: string }[];
  ctaLabel: string;
  onContinue: () => void;
  secondary?: ReactNode;
}

/**
 * The single reusable success moment for every "connected" event in
 * NEXUS: school created, teacher joined, class created, student
 * joined class, parent connected. Keeps that visual language
 * identical everywhere per the design spec.
 */
export function ConnectionSuccess({
  heading,
  subheading,
  details,
  ctaLabel,
  onContinue,
  secondary,
}: ConnectionSuccessProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="relative mb-7 flex h-20 w-20 items-center justify-center rounded-full bg-success/15"
      >
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 16 }}
        >
          <CheckCircle2 className="h-9 w-9 text-success" strokeWidth={1.75} />
        </motion.div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <h2 className="text-xl font-bold text-ink">{heading}</h2>
        {subheading && <p className="mt-1.5 text-sm text-ink-muted">{subheading}</p>}
      </motion.div>

      {details && details.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass-surface mt-6 w-full divide-y divide-white/8 rounded-2xl"
        >
          {details.map((d) => (
            <div key={d.label} className="flex items-center justify-between px-4 py-3 text-left">
              <span className="text-sm text-ink-muted">{d.label}</span>
              <span className="text-sm font-semibold text-ink">{d.value}</span>
            </div>
          ))}
        </motion.div>
      )}

      {secondary && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="w-full">
          {secondary}
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-9 w-full"
      >
        <Button onClick={onContinue}>{ctaLabel}</Button>
      </motion.div>
    </div>
  );
}
