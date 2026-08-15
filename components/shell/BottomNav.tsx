"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_CONFIG } from "@/lib/nav-config";
import type { Role } from "@/types";

export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAV_CONFIG[role];

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2">
      <div className="glass-surface pointer-events-auto mx-4 flex w-full max-w-[440px] items-center justify-between rounded-[1.75rem] px-2 py-2 shadow-glass">
        {items.map((item) => {
          const active = item.href === `/${role}` ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition-colors",
                active ? "text-ink" : "text-ink-faint"
              )}
            >
              {active && <span className="absolute inset-0 -z-10 rounded-2xl bg-white/8" />}
              <Icon className={cn("h-5 w-5", active && "text-accent-soft")} strokeWidth={active ? 2.25 : 1.75} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
