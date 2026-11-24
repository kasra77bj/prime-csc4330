import { Lock } from "lucide-react";
import type { ReactNode } from "react";

/** Shown instead of hiding an action the role can't perform (docs/13 §2). */
export function LockedButton({ children, reason = "Engineer approval required", className = "" }: {
  children: ReactNode; reason?: string; className?: string;
}) {
  return (
    <span className="group relative inline-flex">
      <button type="button" disabled aria-disabled title={reason}
        className={`inline-flex cursor-not-allowed items-center gap-1.5 rounded-ctl bg-border px-3 py-2 text-sm font-medium text-text-muted ${className}`}>
        <Lock aria-hidden className="h-4 w-4" /> {children}
      </button>
      <span role="tooltip" className="pointer-events-none absolute -top-9 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-ctl bg-charcoal px-2 py-1 text-xs text-white group-hover:block">
        {reason}
      </span>
    </span>
  );
}
