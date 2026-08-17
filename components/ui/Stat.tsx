import { cn } from "@/lib/utils";

/**
 * One figure in a divided stat strip — the "Attendance 92% | Assignments
 * 3 pending | Next class 10:00" row that appears on almost every detail
 * screen.
 *
 * This existed as TEN near-identical local copies, one per screen, each
 * drifting slightly in type size and tone handling. Consolidated here so
 * the strip looks the same everywhere and changes in one place. The
 * `size` and `tone` props cover every variant the copies had between
 * them, so no call site had to change how it looks.
 */
export function Stat({
  label,
  value,
  tone,
  size = "md",
  className,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "warning";
  /** Matches the sizes the original copies used. */
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const valueSize = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
    xl: "text-xl",
  }[size];

  return (
    <div className={cn("min-w-0 flex-1 px-3 py-4 text-center", className)}>
      <p
        className={cn(
          "truncate font-bold",
          valueSize,
          tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-ink"
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-ink-faint">{label}</p>
    </div>
  );
}
