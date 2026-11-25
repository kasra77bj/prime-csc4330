import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, FileDown, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { ApiError, download, get, patch, post } from "../api/client";
import type { Report, SessionDetail, SessionSummary } from "../api/types";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import { LockedButton } from "../components/LockedButton";
import { StatusPill, type Level } from "../components/StatusPill";
import { toast } from "../components/Toaster";
import { AppShell } from "../layouts/AppShell";
import { fmt } from "../lib/format";
import { useCan } from "../store/auth";

const STATUS: Record<string, { level: Level; label: string }> = {
  scheduled: { level: "info", label: "Scheduled" }, prechecking: { level: "info", label: "Pre-check" },
  running: { level: "ok", label: "Printing" }, paused: { level: "warning", label: "Paused" },
  stopped: { level: "critical", label: "Stopped" }, completed: { level: "ok", label: "Completed" }, aborted: { level: "critical", label: "Aborted" },
};
const ENDED = ["stopped", "completed", "aborted"];
const dateTime = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "–";
const hm = (s: number) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m` : `${m} min`; };

export function SessionsPage() {
  const nav = useNavigate();
  const canReports = useCan("view_reports");
  const [filter, setFilter] = useState<"all" | "active" | "ended">("all");
  const q = useQuery({ queryKey: ["sessions"], queryFn: () => get<SessionSummary[]>("/sessions"), refetchInterval: 10000 });
  const rows = (q.data ?? []).filter((s) => filter === "all" || (filter === "ended" ? ENDED.includes(s.status) : !ENDED.includes(s.status)));
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm font-medium ${on ? "border-brand-600 bg-brand-50 text-brand-700" : "border-border bg-surface text-text-muted"}`;
  return (
    <AppShell title="Sessions" subtitle="Every print run, with its report once it ends">
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex gap-2">
          {(["all", "active", "ended"] as const).map((f) => <button key={f} type="button" aria-pressed={filter === f} className={chip(filter === f)} onClick={() => setFilter(f)}>{{ all: "All", active: "Active and scheduled", ended: "Finished" }[f]}</button>)}
        </div>
        <div className="overflow-x-auto rounded-card bg-surface shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-text-muted"><tr><th className="p-3 font-medium">Job</th><th className="p-3 font-medium">Printer</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Started</th><th className="p-3 font-medium">Layers</th><th className="p-3 font-medium">Quality</th><th className="p-3" /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-text-muted">{q.isLoading ? "Loading sessions…" : "No sessions match this filter."}</td></tr>}
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="p-3"><span className="font-medium">{s.job_name}</span> <span className="text-text-muted">· {s.job_code}</span></td>
                  <td className="p-3">{s.printer_name}</td>
                  <td className="p-3"><StatusPill {...STATUS[s.status]} /></td>
                  <td className="tabular p-3">{dateTime(s.started_at)}</td>
                  <td className="tabular p-3">{s.current_layer} / {s.total_layers}</td>
                  <td className="tabular p-3">{s.quality_score != null ? `${fmt(s.quality_score, 0)} / 100` : "–"}</td>
                  <td className="p-3 text-right">
                    {ENDED.includes(s.status) ? (canReports ? <Button variant="secondary" onClick={() => nav(`/sessions/${s.id}/report`)}>Report <ArrowRight aria-hidden className="h-4 w-4" /></Button> : <LockedButton reason="Engineers, managers and admins can open reports">Report</LockedButton>)
                      : <Button variant="ghost" onClick={() => nav(`/prints/${s.id}/live`)}>Open live</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="print-break rounded-card bg-surface p-4 shadow-sm">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="tabular mt-1 text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

const SOURCE: Record<string, string> = { ai_accepted: "AI accepted", ai_modified: "AI modified", manual: "Manual" };
const PARAM: Record<string, [string, string]> = { pump_rpm: ["Pump speed", "RPM"], print_speed: ["Print speed", "mm/s"], interlayer_delay: ["Interlayer delay", "min"] };

export function ReportPage() {
  const { sessionId } = useParams();
  const qc = useQueryClient();
  const canExport = useCan("export_data");
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const detail = useQuery({ queryKey: ["session", sessionId], queryFn: () => get<SessionDetail>(`/sessions/${sessionId}`) });
  const rep = useQuery({ queryKey: ["report", sessionId], queryFn: () => get<Report>(`/sessions/${sessionId}/report`) });
  const d = detail.data, r = rep.data, k = r?.kpis;
  const run = async (fn: () => Promise<unknown>, fail: string) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast({ kind: "critical", title: fail, body: e instanceof ApiError ? e.message : null }); } finally { setBusy(false); }
  };
  const regenerate = () => run(async () => { qc.setQueryData(["report", sessionId], await post<Report>(`/sessions/${sessionId}/report`)); toast({ kind: "success", title: "Report regenerated" }); }, "Could not regenerate the report");
  const saveSummary = () => run(async () => { qc.setQueryData(["report", sessionId], await patch<Report>(`/sessions/${sessionId}/report`, { summary_text: editing })); setEditing(null); }, "Could not save the summary");
  const exportAs = (fmt_: "csv" | "json") => { setMenu(false); run(() => download(`/sessions/${sessionId}/export.${fmt_}`, `PRIME_export.${fmt_ === "csv" ? "zip" : "json"}`), "Export failed"); };
  const title = d ? `Session report · ${d.job_name} · ${d.printer_name}` : "Session report";
  const span = k?.started_at ? `${new Date(k.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })}, ${dateTime(k.started_at).split(", ")[1]}–${k.ended_at ? dateTime(k.ended_at).split(", ")[1] : "now"}` : "";
  const widthBand = k ? [k.width.target - k.width.tolerance, k.width.target + k.width.tolerance] : null;
  return (
    <AppShell title={title} subtitle={d ? `Job ${d.job_code} · ${span}` : undefined}>
      {/* The table frame is invisible on screen; when printed (PDF export) its <thead> repeats on every page,
          so the PRIME logo sits top-left as a header on all pages. */}
      <table className="print-frame w-full">
        <thead className="print-only">
          <tr><td>
            <div className="print-header flex items-center gap-3 border-b border-border pb-2" data-testid="report-print-header">
              <Logo tagline />
              <div className="ml-auto text-right text-xs leading-tight text-text-muted">
                <div className="font-semibold text-text">{title}</div>
                {d && <div>Job {d.job_code} · {span}</div>}
              </div>
            </div>
          </td></tr>
        </thead>
        <tbody><tr><td>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          {k && <StatusPill {...STATUS[k.status]} />}
          {k && <span className="text-sm text-text-muted">{hm(k.duration_s)} of print time · generated {dateTime(r?.generated_at)}</span>}
          <div className="no-print ml-auto flex gap-2">
            <Button variant="ghost" onClick={regenerate} disabled={busy}><RefreshCw aria-hidden className="h-4 w-4" /> Regenerate</Button>
            {canExport ? (
              <div className="relative">
                <Button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu"><FileDown aria-hidden className="h-4 w-4" /> Export <ChevronDown aria-hidden className="h-4 w-4" /></Button>
                {menu && (
                  <div role="menu" className="absolute right-0 z-30 mt-1 w-56 rounded-card border border-border bg-surface p-1 shadow-lg">
                    <button role="menuitem" type="button" className="w-full rounded-ctl px-3 py-2 text-left text-sm hover:bg-canvas" onClick={() => exportAs("csv")}>CSV (zip: readings, predictions, adjustments, alerts)</button>
                    <button role="menuitem" type="button" className="w-full rounded-ctl px-3 py-2 text-left text-sm hover:bg-canvas" onClick={() => exportAs("json")}>JSON (full session bundle)</button>
                    <button role="menuitem" type="button" className="w-full rounded-ctl px-3 py-2 text-left text-sm hover:bg-canvas" onClick={() => { setMenu(false); setTimeout(() => window.print(), 50); }}>PDF report (print this page)</button>
                  </div>
                )}
              </div>
            ) : <LockedButton reason="Engineers and managers can export session data">Export</LockedButton>}
          </div>
        </div>
        {rep.isError && <p className="rounded-card bg-critical-50 p-4 text-sm text-critical">The report could not be loaded. {rep.error instanceof ApiError ? rep.error.message : ""}</p>}
        {!k ? <p className="text-sm text-text-muted">{rep.isLoading ? "Building the report…" : ""}</p> : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Key figures">
              <Kpi label="Quality score" value={`${fmt(k.quality_score, 0)}`} hint={`${Math.round(k.quality.layers_within_ratio * 100)} % layers in tolerance · alert response ${Math.round(k.quality.alert_response_factor * 100)} % · decisions ${Math.round(k.quality.decision_factor * 100)} %`} />
              <Kpi label="Layers" value={`${k.layers_done} / ${k.layers_total}`} hint={`${k.layers_within} within width tolerance`} />
              <Kpi label="Alerts" value={String(k.alerts.total)} hint={`${k.alerts.critical} critical · ${k.alerts.warning} warning · ${k.alerts.info} info${k.median_ack_s != null ? ` · median ack ${fmt(k.median_ack_s, 0)} s` : ""}`} />
              <Kpi label="Adjustments" value={String(k.adjustments.total)} hint={`${k.adjustments.ai_accepted} AI accepted · ${k.adjustments.ai_modified} modified · ${k.adjustments.manual} manual`} />
              <Kpi label="Model agreement" value={`${fmt(k.accuracy.extrusion_rate.pct, 0)} %`} hint={`Extrusion within ±4 RPM${k.accuracy.extrusion_rate.mae_rpm != null ? ` (MAE ${fmt(k.accuracy.extrusion_rate.mae_rpm, 1)} RPM)` : ""} · delay ${fmt(k.accuracy.interlayer_delay.pct, 0)} %`} />
            </section>
            <section className="print-break rounded-card border-l-4 border-brand-600 bg-brand-50 p-4" aria-label="Summary">
              <div className="flex items-center justify-between">
                <p className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><Sparkles aria-hidden className="h-3.5 w-3.5" /> Summary · generated by PRIME from the numbers above · editable</p>
                {canExport && editing === null && <Button variant="ghost" className="no-print" onClick={() => setEditing(r!.summary_text)}><Pencil aria-hidden className="h-4 w-4" /> Edit</Button>}
              </div>
              {editing === null ? <p className="mt-2 text-sm leading-relaxed">{r!.summary_text}</p> : (
                <div className="mt-2 space-y-2">
                  <textarea aria-label="Summary text" value={editing} onChange={(e) => setEditing(e.target.value)} rows={6} className="w-full rounded-ctl border border-border p-2 text-sm" />
                  <div className="flex gap-2"><Button onClick={saveSummary} disabled={busy || editing.trim().length < 10}>Save summary</Button><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div>
                </div>
              )}
            </section>
            <div className="grid gap-6 xl:grid-cols-2">
              <section className="print-break rounded-card bg-surface p-4 shadow-sm" aria-label="Layer width">
                <p className="text-sm font-semibold">Layer width per layer vs target</p>
                <div className="h-60">
                  <ResponsiveContainer>
                    <ComposedChart data={r!.charts.layers} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="layer" stroke="var(--text-muted)" fontSize={12} />
                      <YAxis domain={["auto", "auto"]} stroke="var(--text-muted)" fontSize={12} />
                      {widthBand && <ReferenceArea y1={widthBand[0]} y2={widthBand[1]} fill="var(--brand-50)" fillOpacity={0.9} ifOverflow="extendDomain" />}
                      <Tooltip formatter={(v) => [`${fmt(Number(v), 2)} mm`, "Width"]} labelFormatter={(l) => `Layer ${l}`} />
                      <Line dataKey="width_mm" stroke="var(--text)" strokeWidth={2} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-text-muted">Shaded band = target {k.width.target} ± {k.width.tolerance} mm</p>
              </section>
              <section className="print-break rounded-card bg-surface p-4 shadow-sm" aria-label="Pump speed">
                <p className="text-sm font-semibold">Pump speed applied vs AI model</p>
                <div className="h-60">
                  <ResponsiveContainer>
                    <ComposedChart data={r!.charts.layers} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="layer" stroke="var(--text-muted)" fontSize={12} />
                      <YAxis stroke="var(--text-muted)" fontSize={12} />
                      <Tooltip formatter={(v, n) => [`${fmt(Number(v), 1)} RPM`, n === "model_rpm" ? "AI model" : "Applied"]} labelFormatter={(l) => `Layer ${l}`} />
                      <Bar dataKey="avg_rpm" fill="var(--viz-teal)" isAnimationActive={false} />
                      <Line dataKey="model_rpm" stroke="var(--viz-violet)" strokeDasharray="6 4" strokeWidth={2} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-text-muted"><span className="mr-1 inline-block h-2 w-3 bg-viz-teal align-middle" />Applied (mean per layer) · <span className="mx-1 inline-block w-4 border-t-2 border-dashed border-viz-violet align-middle" />XGBoost (mean of 4 checkpoints)</p>
              </section>
            </div>
            <section className="print-break rounded-card bg-surface p-4 shadow-sm" aria-label="Alerts timeline">
              <p className="text-sm font-semibold">Alerts timeline</p>
              {r!.charts.alerts.length === 0 ? <p className="py-4 text-sm text-text-muted">No alerts during this print.</p> : (
                <>
                  <div className="h-28">
                    <ResponsiveContainer>
                      <ScatterChart margin={{ top: 8, right: 16, bottom: 0, left: -24 }}>
                        <XAxis dataKey="layer" type="number" domain={[1, k.layers_total]} allowDecimals={false} stroke="var(--text-muted)" fontSize={12} />
                        <YAxis dataKey="y" type="number" domain={[0, 4]} hide />
                        <ZAxis range={[90, 90]} />
                        <Tooltip formatter={() => ""} labelFormatter={() => ""} content={({ payload }) => payload?.[0] ? <div className="rounded-ctl bg-charcoal px-2 py-1 text-xs text-surface">{(payload[0].payload as { message: string }).message}</div> : null} />
                        {(["info", "warning", "critical"] as const).map((sev, i) => (
                          <Scatter key={sev} data={r!.charts.alerts.filter((a) => a.severity === sev).map((a) => ({ ...a, y: i + 1 }))} fill={sev === "critical" ? "var(--critical)" : sev === "warning" ? "var(--viz-ochre)" : "var(--brand-600)"} isAnimationActive={false} />
                        ))}
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {r!.charts.alerts.map((a) => <li key={a.id}><StatusPill level={a.severity === "critical" ? "critical" : a.severity === "warning" ? "warning" : "info"} label={`Layer ${a.layer}`} /> <span className="ml-1">{a.message}</span></li>)}
                  </ul>
                </>
              )}
            </section>
            <div className="grid gap-6 xl:grid-cols-2">
              <section className="print-break overflow-x-auto rounded-card bg-surface p-4 shadow-sm" aria-label="Parameters">
                <p className="mb-2 text-sm font-semibold">Parameters used</p>
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-text-muted"><tr><th className="py-1 font-medium">Signal</th><th className="font-medium">Start</th><th className="font-medium">End</th><th className="font-medium">Min</th><th className="font-medium">Max</th></tr></thead>
                  <tbody>
                    {r!.parameters_table.map((p) => {
                      const dg = p.unit === "mm" || p.unit === "W" ? 2 : p.unit === "°C" ? 1 : 0;
                      return <tr key={p.signal} className="tabular border-t border-border"><td className="py-1.5 font-sans">{p.label} <span className="text-text-muted">({p.unit})</span></td><td>{fmt(p.start, dg)}</td><td>{fmt(p.end, dg)}</td><td>{fmt(p.min, dg)}</td><td>{fmt(p.max, dg)}</td></tr>;
                    })}
                  </tbody>
                </table>
              </section>
              <section className="print-break overflow-x-auto rounded-card bg-surface p-4 shadow-sm" aria-label="Adjustment log">
                <p className="mb-2 text-sm font-semibold">Adjustment log</p>
                {r!.adjustments.length === 0 ? <p className="text-sm text-text-muted">No parameter changes during this print.</p> : (
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-text-muted"><tr><th className="py-1 font-medium">Layer</th><th className="font-medium">By</th><th className="font-medium">Type</th><th className="font-medium">Change</th><th className="font-medium">Note</th></tr></thead>
                    <tbody>
                      {r!.adjustments.map((a) => (
                        <tr key={a.id} className="border-t border-border">
                          <td className="py-1.5">{a.applied_at_layer ?? a.requested_at_layer}</td><td>{a.user_name}</td><td>{SOURCE[a.source]}</td>
                          <td className="tabular">{PARAM[a.parameter][0]} {fmt(a.from_value, 0)} → {fmt(a.to_value, 0)} {PARAM[a.parameter][1]}</td>
                          <td className="text-text-muted">{a.note ?? "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>
          </>
        )}
      </div>
        </td></tr></tbody>
      </table>
    </AppShell>
  );
}
