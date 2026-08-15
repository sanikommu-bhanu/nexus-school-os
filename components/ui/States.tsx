"use client";

import { motion } from "framer-motion";
import { Loader2, AlertCircle, CheckCircle2, Inbox } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LoadingState({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-accent-soft" />
      <p className="text-sm text-ink-muted">{message}</p>
    </div>
  );
}

export function ErrorState({
  message = "Something went wrong.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/12">
        <AlertCircle className="h-5.5 w-5.5 text-danger" />
      </div>
      <p className="max-w-[240px] text-sm text-ink-muted">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-sm font-semibold text-accent-soft">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/6">
        {icon ?? <Inbox className="h-5.5 w-5.5 text-ink-faint" />}
      </div>
      <div>
        <p className="text-base font-semibold text-ink">{title}</p>
        {message && <p className="mt-1 max-w-[260px] text-sm text-ink-muted">{message}</p>}
      </div>
      {action}
    </div>
  );
}

export function SuccessState({
  title,
  message,
  className,
}: {
  title: string;
  message?: string;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center", className)}
    >
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
        <CheckCircle2 className="h-8 w-8 text-success" />
      </div>
      <div>
        <p className="text-lg font-semibold text-ink">{title}</p>
        {message && <p className="mt-1 max-w-[260px] text-sm text-ink-muted">{message}</p>}
      </div>
    </motion.div>
  );
}
