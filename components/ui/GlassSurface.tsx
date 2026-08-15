import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  as?: "div";
  rounded?: "xl" | "2xl" | "3xl" | "4xl";
  padded?: boolean;
}

/**
 * The single source of glassmorphism in the app. Every card, sheet,
 * and panel should compose this rather than re-declaring
 * bg/border/blur ad hoc — keeps the glass language consistent.
 */
export function GlassSurface({
  className,
  rounded = "3xl",
  padded = true,
  children,
  ...props
}: GlassSurfaceProps) {
  return (
    <div
      className={cn(
        "glass-surface",
        rounded === "xl" && "rounded-xl",
        rounded === "2xl" && "rounded-2xl",
        rounded === "3xl" && "rounded-3xl",
        rounded === "4xl" && "rounded-4xl",
        padded && "p-5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
