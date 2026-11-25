import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BellRing, Check, Circle, CircleDot, Gauge, Layers, Play, Sparkles, Target, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { get } from "../api/client";
import type { Achievements, AlertOut, DashboardSummary, PrinterLive, Reading, Recommendation, WsEnvelope } from "../api/types";
import { Button } from "../components/Button";
import { StatusPill } from "../components/StatusPill";
import { AppShell } from "../layouts/AppShell";
import { clock, fmt, greeting } from "../lib/format";
import { useAuth } from "../store/auth";
import { socket } from "../ws/socket";
import { saveOnboarding } from "./OnboardingPages";

/** "Getting started" checklist (docs/06 part A): reads the same onboarding flags as the flow. */
function Checklist() {
  const me = useAuth((s) => s.me);
  const nav = useNavigate();
  const ob = (me?.onboarding ?? {}) as Record<string, boolean>;
  if (!me || ob.dismissed) return null;
  const items = [
    ["Secure your account (2-factor)", me.mfa_enrolled, null],
    ["Meet your dashboard", ob.welcome_done, "/onboarding/welcome"],
    ["Practice hold-to-stop", ob.practice_stop_done, "/onboarding/tour"],
    ["Watch your first live print", ob.first_live_watched, null],
    ["Acknowledge your first alert", ob.first_alert_ack, null],
  ] as const;
  const done = items.filter((i) => i[1]).length;
  return (
    <section className="rounded-card border-l-4 border-ok bg-surface p-4 shadow-sm" aria-label="Getting started">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="font-semibold">Getting started {done}/{items.length}</p>
          <div className="mt-2 h-1.5 max-w-sm overflow-hidden rounded-full bg-canvas"><div className="h-full bg-ok" style={{ width: `${(done / items.length) * 100}%` }} /></div>
        </div>
        <Button variant="ghost" aria-label="Dismiss the checklist" onClick={() => saveOnboarding({ dismissed: true }).catch(() => undefined)}><X className="h-4 w-4" /></Button>
      </div>
      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-5">
        {items.map(([label, ok, link]) => (
          <li key={label} className="flex items-center gap-2">
            {ok ? <Check aria-hidden className="h-4 w-4 text-ok" /> : <Circle aria-hidden className="h-4 w-4 text-text-muted" />}
            {!ok && link ? <button type="button" className="text-left text-brand-700 underline" onClick={() => nav(link)}>{label}</button> : <span className={ok ? "text-text-muted line-through" : ""}>{label}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

type Live = Pick<Reading, "layer" | "phase" | "temperature" | "pump_rpm" | "print_speed" | "sll_width" | "motor_power" | "delay_setting_min">;

function Kpi({ label, value, hint, icon: Icon, tone = "neutral" }: { label: string; value: string; hint?: string; icon: typeof Gauge; tone?: "neutral" | "ai" | "warn" }) {
  return (
    <div className="rounded-card bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm text-text-muted">
        {label}
        <Icon aria-hidden className={`h-5 w-5 ${tone === "ai" ? "text-viz-violet" : tone === "warn" ? "text-viz-ochre" : "text-brand-600"}`} />
      </div>
      <p className="tabular mt-2 text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Ready to start", prechecking: "Sensor pre-check", running: "Printing", paused: "Paused",
  stopped: "Stopped", completed: "Completed", aborted: "Aborted",
};

function PrinterCard({ p, live, onOpen }: { p: PrinterLive; live?: Live; onOpen: (id: string) => void }) {
  const s = p.active_session;
  const active = s && ["running", "paused", "prechecking"].includes(s.status);
  const width = live?.sll_width;
  const level = width == null ? "ok" : width < 17.5 || width > 21.5 ? "critical" : width < 18.5 || width > 20.5 ? "warning" : "ok";
  const pct = s?.total_layers ? Math.round(((live?.layer ?? s.current_layer) / s.total_layers) * 100) : 0;
  return (
    <div className="flex flex-col rounded-card bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{p.name} <span className="font-normal text-text-muted">· {p.bay}</span></p>
          <p className="text-sm text-text-muted">{s ? `${s.job_name} (${s.job_code})` : "Idle · no job scheduled"}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${active ? "text-ok" : "text-text-muted"}`}>
          <CircleDot aria-hidden className="h-3.5 w-3.5" /> {s ? STATUS_LABEL[s.status] : "Idle"}
        </span>
      </div>
      {s && (
        <>
          <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas"><div className="h-full bg-brand-600" style={{ width: `${pct}%` }} /></div>
            Layer {live?.layer ?? s.current_layer ?? 0}/{s.total_layers}
          </div>
          {active && live && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><dt className="text-xs text-text-muted">Temperature</dt><dd className="tabular font-semibold">{fmt(live.temperature, 1)} °C</dd></div>
              <div><dt className="text-xs text-text-muted">Pump</dt><dd className="tabular font-semibold">{fmt(live.pump_rpm, 0)} RPM</dd></div>
              <div><dt className="text-xs text-text-muted">Layer width</dt><dd className="tabular font-semibold">{fmt(width, 2)} mm</dd></div>
              <div><dt className="text-xs text-text-muted">{live.phase === "printing" ? "Speed" : "Waiting"}</dt>
                <dd className="tabular font-semibold">{live.phase === "printing" ? `${fmt(live.print_speed, 0)} mm/s` : `${live.delay_setting_min} min delay`}</dd></div>
            </dl>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            {active ? <StatusPill level={level} label={level === "ok" ? "In range" : "Width out of range"} /> : <span />}
            <Button variant={active ? "primary" : "secondary"} onClick={() => onOpen(s.id)}>
              {active ? <>Open live <ArrowRight aria-hidden className="h-4 w-4" /></> : <><Play aria-hidden className="h-4 w-4" /> Open to start</>}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function DashboardPage() {
  const me = useAuth((s) => s.me);
  const nav = useNavigate();
  const qc = useQueryClient();
  const ach = useQuery({ queryKey: ["achievements"], queryFn: () => get<Achievements>("/me/achievements"), refetchInterval: 30000 });
  const summary = useQuery({ queryKey: ["summary"], queryFn: () => get<DashboardSummary>("/dashboard/summary"), refetchInterval: 10000 });
  const printers = useQuery({ queryKey: ["printers"], queryFn: () => get<PrinterLive[]>("/printers"), refetchInterval: 15000 });
  const alerts = useQuery({ queryKey: ["alerts", "recent"], queryFn: () => get<AlertOut[]>("/alerts?limit=5") });
  const activeIds = (printers.data ?? []).map((p) => p.active_session).filter((s) => s && ["running", "paused", "prechecking"].includes(s.status)).map((s) => s!.id);
  const recs = useQuery({
    queryKey: ["recs", activeIds.join(",")],
    queryFn: async () => (await Promise.all(activeIds.map((id) => get<Recommendation[]>(`/sessions/${id}/recommendations?status=pending`)))).flat(),
    enabled: activeIds.length > 0,
  });
  const [live, setLive] = useState<Record<string, Live>>({});
  const siteId = me?.sites[0]?.id;
  useEffect(() => {
    if (!siteId) return;
    const unsub = socket.subscribe(`site:${siteId}`);
    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (t) return;
      t = setTimeout(() => { t = null; qc.invalidateQueries({ queryKey: ["summary"] }); qc.invalidateQueries({ queryKey: ["alerts"] }); qc.invalidateQueries({ queryKey: ["recs"] }); qc.invalidateQueries({ queryKey: ["printers"] }); }, 800);
    };
    const off = socket.on((m: WsEnvelope) => {
      if (m.channel !== `site:${siteId}`) return;
      if (m.type === "session_reading") {
        const d = m.data as Live & { printer_id: string };
        setLive((cur) => ({ ...cur, [d.printer_id]: d }));
      } else if (["control", "alert", "recommendation"].includes(m.type)) refresh();
    });
    return () => { off(); unsub(); if (t) clearTimeout(t); };
  }, [siteId, qc]);

  const s = summary.data;
  const today = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" });
  return (
    <AppShell title={greeting(me?.full_name ?? "")} subtitle={`${today} · ${me?.sites[0]?.name ?? ""}`}>
      <div className="space-y-6 p-4 sm:p-6">
        <Checklist />
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Today at a glance">
          <Kpi label="Active prints" value={s ? String(s.active_prints) : "–"} icon={Gauge} />
          <Kpi label="Open alerts" value={s ? String(s.open_alerts) : "–"} icon={BellRing} tone={s?.open_alerts ? "warn" : "neutral"}
            hint={s ? `${s.open_alerts_by_severity.critical} critical · ${s.open_alerts_by_severity.warning} warning` : undefined} />
          <Kpi label="AI suggestions pending" value={s ? String(s.ai_suggestions_pending) : "–"} icon={Sparkles} tone="ai" />
          <Kpi label="Shift quality score" value={s?.shift_quality_score != null ? `${s.shift_quality_score} / 100` : "–"} icon={Gauge}
            hint={s?.shift_quality_score == null ? "Scores appear after the first completed print" : undefined} />
        </section>
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <section aria-label="Printers">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Printers</h2>
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {(printers.data ?? []).map((p) => <PrinterCard key={p.id} p={p} live={live[p.id]} onOpen={(id) => nav(`/prints/${id}/live`)} />)}
            </div>
          </section>
          <aside className="space-y-4" aria-label="Needs your attention">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Needs your attention</h2>
            {(recs.data ?? []).map((r) => (
              <button key={r.id} type="button" onClick={() => nav(`/prints/${r.session_id}/ai`)}
                className="w-full rounded-card border-l-4 border-brand-600 bg-brand-50 p-3 text-left shadow-sm hover:bg-[#dde8f0]">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700"><Sparkles aria-hidden className="h-3.5 w-3.5" /> AI suggestion</span>
                <p className="mt-1 font-semibold">{r.title}</p>
                <p className="text-xs text-text-muted">{Math.round((r.confidence ?? 0) * 100)}% confidence · Review</p>
              </button>
            ))}
            {(recs.data ?? []).length === 0 && <p className="rounded-card bg-surface p-3 text-sm text-text-muted shadow-sm">No AI suggestions waiting.</p>}
            {ach.data?.goal && (
              <div className="rounded-card bg-surface p-3 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-semibold"><Target aria-hidden className="h-4 w-4 text-ok" /> {ach.data.goal.shift_label} goal: {ach.data.goal.goal_text}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full bg-ok" style={{ width: `${(ach.data.goal.progress / ach.data.goal.target) * 100}%` }} /></div>
                <p className="mt-1 flex items-center justify-between text-xs text-text-muted">
                  <span className="tabular">{ach.data.goal.progress} of {ach.data.goal.target}</span>
                  <span className="inline-flex items-center gap-1"><Layers aria-hidden className="h-3.5 w-3.5" /> {ach.data.streak}-layer clean streak</span>
                </p>
              </div>
            )}
            <div className="rounded-card bg-surface p-3 shadow-sm">
              <p className="mb-2 text-sm font-semibold">Recent alerts</p>
              <ul className="space-y-2">
                {(alerts.data ?? []).length === 0 && <li className="text-sm text-text-muted">No alerts yet today.</li>}
                {(alerts.data ?? []).map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-sm">
                    <StatusPill level={a.severity === "critical" ? "critical" : a.severity === "warning" ? "warning" : "info"}
                      label={a.status === "resolved" ? "Resolved" : undefined} />
                    <span className="flex-1">{a.message}</span>
                    <span className="text-xs text-text-muted">{clock(a.raised_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
