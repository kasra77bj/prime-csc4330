import { CheckCircle2, Info, OctagonAlert, TriangleAlert } from "lucide-react";

export type Level = "ok" | "warning" | "critical" | "info";

const STYLE: Record<Level, { cls: string; icon: typeof CheckCircle2; iconCls: string; label: string }> = {
  ok: { cls: "bg-ok-50 text-ok", icon: CheckCircle2, iconCls: "", label: "In range" },
  warning: { cls: "bg-warn-50 text-text", icon: TriangleAlert, iconCls: "text-viz-ochre", label: "Warning" },
  critical: { cls: "bg-critical-50 text-critical", icon: OctagonAlert, iconCls: "", label: "Critical" },
  info: { cls: "bg-brand-50 text-brand-700", icon: Info, iconCls: "", label: "Info" },
};

/** Status = color + icon + text (never color alone). */
export function StatusPill({ level, label, className = "" }: { level: Level; label?: string; className?: string }) {
  const s = STYLE[level];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls} ${className}`}>
      <Icon aria-hidden className={`h-3.5 w-3.5 ${s.iconCls}`} />
      {label ?? s.label}
    </span>
  );
}
