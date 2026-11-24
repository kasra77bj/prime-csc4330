import type { WidthEffect } from "../api/types";

/** Mini "predicted effect" chart: history (text color), with the change (violet dashed), without (ochre dotted),
 *  target band (brand-50). Colors follow docs/01 §2.4. */
export function EffectChart({ e }: { e: WidthEffect }) {
  const W = 300, H = 110, P = 24;
  const all = [...e.history, ...e.with_change, ...e.without_change, e.target - e.tolerance, e.target + e.tolerance];
  const lo = Math.min(...all) - 0.3, hi = Math.max(...all) + 0.3;
  const n = e.history.length + 3;
  const x = (i: number) => P + (i / (n - 1)) * (W - P * 1.5);
  const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo)) * (H - 22);
  const line = (vals: number[], start: number) => vals.map((v, i) => `${i ? "L" : "M"}${x(start + i)},${y(v)}`).join(" ");
  const h = e.history.length - 1;
  const last = e.history[h];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[110px] w-full" role="img"
        aria-label={`Layer width ${last} mm now; with the change it reaches ${e.with_change[2]} mm, without it ${e.without_change[2]} mm`}>
        <rect x={P} width={W - P * 1.5} y={y(e.target + e.tolerance)} height={y(e.target - e.tolerance) - y(e.target + e.tolerance)} fill="var(--brand-50)" />
        <line x1={P} x2={W - P / 2} y1={y(e.target)} y2={y(e.target)} stroke="var(--brand-600)" strokeWidth={1} strokeDasharray="2 3" />
        <path d={line(e.history, 0)} fill="none" stroke="var(--text)" strokeWidth={2} />
        <path d={line([last, ...e.without_change], h)} fill="none" stroke="var(--viz-ochre)" strokeWidth={2} strokeDasharray="2 3" />
        <path d={line([last, ...e.with_change], h)} fill="none" stroke="var(--viz-violet)" strokeWidth={2.2} strokeDasharray="6 4" />
        <line x1={x(h)} x2={x(h)} y1={4} y2={H - 16} stroke="var(--border)" />
        <text x={x(h) + 3} y={H - 4} fontSize={9} fill="var(--text-muted)">now</text>
        <text x={2} y={y(e.target) + 3} fontSize={9} fill="var(--brand-700)">{e.target}</text>
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-text align-middle" />Measured width</span>
        <span><span className="mr-1 inline-block w-4 border-t-2 border-dashed border-viz-violet align-middle" />With the change</span>
        <span><span className="mr-1 inline-block w-4 border-t-2 border-dotted border-viz-ochre align-middle" />Without</span>
      </figcaption>
    </figure>
  );
}
