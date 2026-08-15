"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  showBack?: boolean;
  trailing?: ReactNode;
}

export function PageHeader({ title, subtitle, onBack, showBack = true, trailing }: PageHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex items-start justify-between pb-6 pt-4">
      <div className="flex items-start gap-3">
        {showBack && (
          <button
            onClick={onBack ?? (() => router.back())}
            aria-label="Go back"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full glass-surface"
          >
            <ChevronLeft className="h-4.5 w-4.5" />
          </button>
        )}
        <div>
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {trailing}
    </div>
  );
}
