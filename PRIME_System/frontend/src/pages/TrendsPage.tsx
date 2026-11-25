import { useQuery } from "@tanstack/react-query";
import { Download, Sparkles } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { get } from "../api/client";
import type { LimitOut } from "../api/types";
import { Button } from "../components/Button";
import { LockedButton } from "../components/LockedButton";
import { PrintLayout } from "../layouts/PrintLayout";
import { duration, fmt, SIGNAL_META } from "../lib/format";
import { useCan } from "../store/auth";
import { useSession } from "../store/live";

type Sig = "sll_width" | "sll_height" | "pump_rpm" | "temperature" | "motor_power" | "print_speed" | "flow" | "delay_setting_min";
const SIGS: Sig[] = ["sll_width", "pump_rpm", "temperature", "motor_power", "sll_height", "print_speed", "flow", "delay_setting_min"];
const COLORS = ["var(--text)", "var(--viz-teal)"];          // measured, second series (docs/16 §4)
const WINDOWS = [["5m", 300], ["15m", 900], ["1h", 3600], ["Whole print", 0]] as const;
type Point = Record<string, number | null> & { t_s: number; layer: number };

export function stats(vals: number[]) {
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - avg) ** 2, 0) / vals.length);
  return { min: Math.min(...vals), max: Math.max(...vals), avg, sd };
}

function toCsv(points: Point[], sigs: Sig[]): string {
  const head = ["print_time_s", "layer", ...sigs.map((s) => `${s}_${SIGNAL_META[s].unit}`)];
  return [head.join(","), ...points.map((p) => [p.t_s, p.layer, ...sigs.map((s) => p[s] ?? "")].join(","))].join("\n");
}

export function TrendsPage() {
  const { sessionId } = useParams();
  const s = useSession(sessionId);
  const canExport = useCan("export_data");
  const [sel, setSel] = useState<Sig[]>(["sll_width"]);
  const [win, setWin] = useState<number>(900);
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const live = s.status === "running" || s.status === "prechecking";
  const range = custom ? `from_s=${custom.from * 60}&to_s=${custom.to * 60}` : win ? `last_s=${win}` : "from_s=0";
  const q = useQuery({
    queryKey: ["trend", sessionId, sel.join(","), range],
    queryFn: () => get<{ bucket_s: number; points: Point[] }>(`/sessions/${sessionId}/readings?signals=${sel.join(",")}&${range}`),
    enabled: !!sessionId && sel.length > 0, refetchInterval: live && !custom ? 3000 : false, placeholderData: (p) => p,
  });
  const primary = sel[0];
  const points = q.data?.points ?? [];
  const lim: LimitOut | undefined = s.detail?.limits.find((l) => l.signal === primary);
  // the models predict pump speed (XGBoost) and interlayer delay (Random Forest): one value per layer
  const predOf = primary === "pump_rpm" ? s.preds.extrusion_rate : primary === "delay_setting_min" ? s.preds.interlayer_delay : null;
  const byLayer = new Map<number, number[]>();
  for (const p of predOf ?? []) byLayer.set(p.layer, [...(byLayer.get(p.layer) ?? []), p.value]);
  const data = points.map((p) => {
    const ps = byLayer.get(p.layer);
    return { ...p, model: ps ? (primary === "pump_rpm" ? ps.reduce((a, b) => a + b, 0) / ps.length : ps[ps.length - 1]) : null };
  });
  const firstT = new Map<number, number>();
  for (const p of points) if (!firstT.has(p.layer)) firstT.set(p.layer, p.t_s);
  const st = stats(points.map((p) => p[primary]).filter((v): v is number => v != null));
  const notes = [
    ...Object.values(s.alerts).map((a) => ({ layer: a.layer_no, text: `${a.severity === "critical" ? "Critical" : "Warning"} alert: ${a.message}`, kind: "alert" as const })),
    ...s.adjustments.filter((a) => a.applied_at_layer).map((a) => ({
      layer: a.applied_at_layer!, kind: "adj" as const,
      text: `${SIGNAL_META[a.parameter === "interlayer_delay" ? "delay_setting_min" : a.parameter].label} ${fmt(a.from_value, 0)} → ${fmt(a.to_value, 0)} applied (${a.source === "manual" ? "manual" : "AI suggestion"})`,
    })),
  ].sort((a, b) => a.layer - b.layer);
  const toggle = (k: Sig) => setSel((cur) => cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k].slice(-2));
  const save = () => {
    const url = URL.createObjectURL(new Blob([toCsv(points, sel)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `PRIME_trends_${s.detail?.job_code ?? "print"}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const meta = SIGNAL_META[primary];
  return (
    <PrintLayout>
      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-4" aria-label="Signals">
          <fieldset className="rounded-card bg-surface p-4 shadow-sm">
            <legend className="sr-only">Signals</legend>
            <p className="mb-2 text-sm font-semibold">Signals <span className="font-normal text-text-muted">(up to two)</span></p>
            {SIGS.map((k) => {
              const i = sel.indexOf(k);
              return (
                <label key={k} className="flex cursor-pointer items-center gap-2 rounded-ctl px-1 py-1.5 text-sm hover:bg-canvas">
                  <input type="checkbox" checked={i >= 0} onChange={() => toggle(k)} className="h-4 w-4 accent-[var(--brand-600)]" />
                  <span className="h-0.5 w-4" style={{ background: i >= 0 ? COLORS[i] : "var(--border)" }} aria-hidden />
                  {SIGNAL_META[k].label}
                </label>
              );
            })}
          </fieldset>
          <p className="flex gap-2 rounded-card bg-brand-50 p-3 text-xs text-brand-700">
            <Sparkles aria-hidden className="h-4 w-4 shrink-0" />
            Pick pump speed or interlayer delay as the first signal to see the AI model's value as a dashed violet line.
          </p>
        </aside>
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {WINDOWS.map(([label, secs]) => (
              <button key={label} type="button" aria-pressed={!custom && win === secs} onClick={() => { setCustom(null); setWin(secs); }}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${!custom && win === secs ? "border-brand-600 bg-brand-50 text-brand-700" : "border-border bg-surface text-text-muted"}`}>
                {label}
              </button>
            ))}
            <button type="button" aria-pressed={!!custom} onClick={() => setCustom(custom ?? { from: 0, to: Math.ceil((s.lastAny?.sim_t_s ?? 600) / 60) })}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${custom ? "border-brand-600 bg-brand-50 text-brand-700" : "border-border bg-surface text-text-muted"}`}>
              Custom
            </button>
            {custom && (
              <span className="flex items-center gap-1 text-sm text-text-muted">
                print minute
                <input type="number" min={0} value={custom.from} onChange={(e) => setCustom({ ...custom, from: Number(e.target.value) })} className="w-16 rounded-ctl border border-border px-2 py-1" aria-label="From print minute" />
                to
                <input type="number" min={1} value={custom.to} onChange={(e) => setCustom({ ...custom, to: Number(e.target.value) })} className="w-16 rounded-ctl border border-border px-2 py-1" aria-label="To print minute" />
              </span>
            )}
            <span className="ml-auto">
              {canExport ? <Button variant="secondary" onClick={save} disabled={!points.length}><Download aria-hidden className="h-4 w-4" /> Download view (CSV)</Button>
                : <LockedButton reason="Engineers and managers can export data">Download view (CSV)</LockedButton>}
            </span>
          </div>
          <div className="rounded-card bg-surface p-4 shadow-sm">
            <p className="mb-2 text-sm font-semibold">{sel.map((k) => SIGNAL_META[k].label).join(" and ") || "Pick a signal"}
              {q.data && <span className="ml-2 font-normal text-text-muted">· averaged every {q.data.bucket_s} s of print time</span>}</p>
            {sel.length === 0 ? <p className="py-16 text-center text-sm text-text-muted">Choose at least one signal on the left.</p> :
              points.length === 0 ? <p className="py-16 text-center text-sm text-text-muted">{q.isLoading ? "Loading…" : "No readings in this window yet."}</p> : (
                <div className="h-[380px]">
                  <ResponsiveContainer>
                    <ComposedChart data={data} margin={{ top: 8, right: sel[1] ? 8 : 24, bottom: 8, left: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="t_s" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => duration(v)} stroke="var(--text-muted)" fontSize={12} />
                      <YAxis yAxisId="a" domain={["auto", "auto"]} stroke="var(--text-muted)" fontSize={12} width={56} tickFormatter={(v: number) => fmt(v, meta.digits > 1 ? 1 : meta.digits)} />
                      {sel[1] && <YAxis yAxisId="b" orientation="right" domain={["auto", "auto"]} stroke="var(--viz-teal)" fontSize={12} width={56} />}
                      {lim?.normal_min != null && lim.normal_max != null && <ReferenceArea yAxisId="a" y1={lim.normal_min} y2={lim.normal_max} fill="var(--brand-50)" fillOpacity={0.9} ifOverflow={primary === "sll_width" || primary === "sll_height" ? "extendDomain" : "hidden"} />}
                      {lim?.critical_min != null && lim.normal_min != null && <ReferenceArea yAxisId="a" y1={lim.critical_min} y2={lim.normal_min} fill="var(--viz-ochre)" fillOpacity={0.15} ifOverflow="hidden" />}
                      {lim?.critical_max != null && lim.normal_max != null && <ReferenceArea yAxisId="a" y1={lim.normal_max} y2={lim.critical_max} fill="var(--viz-ochre)" fillOpacity={0.15} ifOverflow="hidden" />}
                      {lim?.critical_min != null && <ReferenceLine yAxisId="a" y={lim.critical_min} stroke="var(--critical)" strokeDasharray="5 4" />}
                      {lim?.critical_max != null && <ReferenceLine yAxisId="a" y={lim.critical_max} stroke="var(--critical)" strokeDasharray="5 4" />}
                      {notes.filter((n) => firstT.has(n.layer)).map((n, i) => (
                        <ReferenceLine key={i} yAxisId="a" x={firstT.get(n.layer)} stroke={n.kind === "alert" ? "var(--viz-ochre)" : "var(--brand-600)"} strokeDasharray="2 3" />
                      ))}
                      <Tooltip labelFormatter={(v) => `Print time ${duration(Number(v))}`}
                        formatter={(v, name) => [fmt(Number(v), 2), name === "model" ? "AI model" : SIGNAL_META[name as Sig]?.label ?? String(name)]} />
                      <Line yAxisId="a" dataKey={primary} stroke={COLORS[0]} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                      {predOf && <Line yAxisId="a" dataKey="model" stroke="var(--viz-violet)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} type="stepAfter" connectNulls />}
                      {sel[1] && <Line yAxisId="b" dataKey={sel[1]} stroke={COLORS[1]} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
              <span><span className="mr-1 inline-block h-3 w-4 bg-brand-50 align-middle" />Normal range</span>
              <span><span className="mr-1 inline-block w-4 border-t-2 border-dashed border-critical align-middle" />Critical limit</span>
              {predOf && <span><span className="mr-1 inline-block w-4 border-t-2 border-dashed border-viz-violet align-middle" />AI model ({primary === "pump_rpm" ? "XGBoost, mean per layer" : "Random Forest class"})</span>}
              <span><span className="mr-1 inline-block w-4 border-t-2 border-dotted border-viz-ochre align-middle" />Alert</span>
              <span><span className="mr-1 inline-block w-4 border-t-2 border-dotted border-brand-600 align-middle" />Change applied</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {(["min", "max", "avg", "sd"] as const).map((k) => (
              <div key={k} className="rounded-card bg-surface p-3 shadow-sm">
                <p className="text-xs text-text-muted">{{ min: "Min", max: "Max", avg: "Average", sd: "Std. deviation (σ)" }[k]}</p>
                <p className="tabular text-xl font-semibold">{st ? fmt(st[k], meta.digits > 1 ? 2 : meta.digits) : "–"} <span className="text-sm font-normal text-text-muted">{meta.unit}</span></p>
              </div>
            ))}
          </div>
          <div className="rounded-card bg-surface p-4 shadow-sm">
            <p className="mb-2 text-sm font-semibold">Annotations</p>
            {notes.length === 0 ? <p className="text-sm text-text-muted">No alerts or applied changes yet.</p> : (
              <ul className="space-y-1 text-sm">
                {notes.map((n, i) => <li key={i}><span className="tabular mr-2 text-text-muted">Layer {n.layer}</span>{n.text}</li>)}
              </ul>
            )}
          </div>
        </section>
      </div>
    </PrintLayout>
  );
}
