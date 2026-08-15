"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ListRow({
  href,
  leading,
  title,
  subtitle,
  trailing,
  className,
}: {
  href?: string;
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  const content = (
    <div className={cn("flex items-center gap-3 rounded-2xl px-1 py-3", className)}>
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{title}</p>
        {subtitle && <p className="truncate text-xs text-ink-muted">{subtitle}</p>}
      </div>
      {trailing}
      {href && <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block active:scale-[0.99] transition-transform">
        {content}
      </Link>
    );
  }
  return content;
}

const INSIGHT_TONE = {
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/12 text-danger",
  success: "bg-success/12 text-success",
  accent: "bg-accent/12 text-accent-soft",
};

export function InsightCard({
  icon,
  title,
  message,
  tone = "accent",
  href,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  tone?: keyof typeof INSIGHT_TONE;
  href?: string;
}) {
  const body = (
    <div className="glass-surface flex items-start gap-3 rounded-2xl p-4">
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", INSIGHT_TONE[tone])}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{message}</p>
      </div>
      {href && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint" />}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
