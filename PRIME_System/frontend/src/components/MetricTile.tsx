import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { fmt } from "../lib/format";
import type { Point } from "../store/live";
import { Sparkline } from "./Sparkline";
import { StatusPill, type Level } from "./StatusPill";

export interface TileProps {
  label: string;
  value: number | null | undefined;
  unit: string;
  digits?: number;
  range?: string;
  level: Level;
  levelLabel?: string;
  points?: Point[];
  band?: [number | null, number | null];
  ai?: ReactNode;
  secondary?: ReactNode;
  size?: "md" | "lg";
}

/** Live value tile: label · big value + unit · normal range · sparkline · status pill (docs/01 §6). */
export function MetricTile(p: TileProps) {
  const border = p.level === "critical" ? "border-l-4 border-critical" : p.level === "warning" ? "border-l-4 border-viz-ochre" : "";
  return (
    <div className={`flex flex-col gap-2 rounded-card bg-surface p-4 shadow-sm ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-text-muted">{p.label}</p>
        <StatusPill level={p.level} label={p.levelLabel} />
      </div>
      <p className={`tabular font-semibold leading-none ${p.size === "lg" ? "text-[40px]" : "text-[32px]"}`}>
        {fmt(p.value, p.digits ?? 1)} <span className="text-base font-medium text-text-muted">{p.unit}</span>
      </p>
      {p.secondary && <div className="text-sm text-text-muted">{p.secondary}</div>}
      {p.points && <Sparkline points={p.points} band={p.band} />}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{p.range}</span>
        {p.ai && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
            <Sparkles aria-hidden className="h-3 w-3" /> {p.ai}
          </span>
        )}
      </div>
    </div>
  );
}
