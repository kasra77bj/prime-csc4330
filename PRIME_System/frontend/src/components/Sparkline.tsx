import type { Point } from "../store/live";

/** Crisp inline-SVG sparkline with an optional normal band (target band in brand-50). */
export function Sparkline({ points, band, height = 36, color = "var(--text)" }: {
  points: Point[]; band?: [number | null, number | null]; height?: number; color?: string;
}) {
  const w = 160;
  if (points.length < 2) return <div style={{ height }} className="rounded bg-canvas" />;
  const vs = points.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (band?.[0] != null) lo = Math.min(lo, band[0]);
  if (band?.[1] != null) hi = Math.max(hi, band[1]);
  const pad = (hi - lo) * 0.1 || 1;
  lo -= pad; hi += pad;
  const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * w;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      {band && band[0] != null && band[1] != null && (
        <rect x={0} width={w} y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} fill="var(--brand-50)" />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
