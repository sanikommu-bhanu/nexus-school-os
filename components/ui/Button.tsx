import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "text";
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", loading, fullWidth = true, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          variant === "primary" && "btn-action",
          variant === "ghost" && "btn-ghost",
          variant === "text" &&
            "inline-flex items-center justify-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink",
          fullWidth && variant !== "text" && "w-full",
          className
        )}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
      </button>
    );
  }
);
Button.displayName = "Button";
