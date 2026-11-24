import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const V: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-border disabled:text-text-muted",
  secondary: "border border-brand-600 bg-surface text-brand-600 hover:bg-brand-50 disabled:border-border disabled:text-text-muted",
  ghost: "text-text-muted hover:bg-canvas hover:text-text",
  danger: "bg-critical text-white hover:opacity-90",
};

export function Button({ variant = "primary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-ctl px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${V[variant]} ${className}`}
    />
  );
}
