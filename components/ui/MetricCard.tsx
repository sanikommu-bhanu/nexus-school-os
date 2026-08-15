import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneText = {
    neutral: "text-ink",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];

  return (
    <div className="glass-surface flex flex-col gap-2 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-faint">{label}</p>
        {icon}
      </div>
      <p className={cn("text-2xl font-bold", toneText)}>{value}</p>
      {hint && <p className="text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">{title}</h2>
      {action}
    </div>
  );
}
