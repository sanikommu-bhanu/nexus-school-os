import { cn } from "@/lib/utils";

export function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === current ? "w-6 bg-action" : "w-1.5 bg-white/15"
          )}
        />
      ))}
    </div>
  );
}
