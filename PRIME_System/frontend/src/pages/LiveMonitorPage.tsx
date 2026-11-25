import { Clock3, Hourglass, Layers, Megaphone, ScanLine, Wrench } from "lucide-react";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, post } from "../api/client";
import type { EscalateOut, LimitOut, Reading, SignalKey } from "../api/types";
import { AiRecommendationCard } from "../components/AiRecommendationCard";
import { topAlert } from "../components/AlertBanner";
import { Button } from "../components/Button";
import { MetricTile } from "../components/MetricTile";
import type { Level } from "../components/StatusPill";
import { toast } from "../components/Toaster";
import { PrintLayout } from "../layouts/PrintLayout";
import { duration, fmt, SIGNAL_META } from "../lib/format";
import { useAuth, useCan } from "../store/auth";
import { useSession } from "../store/live";
import { saveOnboarding } from "./OnboardingPages";

/** Print quality score ring (docs/06 part C.1): 0–100, formula in the tooltip. */
function QualityRing({ score, streak }: { score: number | null; streak: number }) {
  const r = 15, c = 2 * Math.PI * r, v = score ?? 0;
  const color = v >= 90 ? "var(--ok)" : v >= 75 ? "var(--viz-ochre)" : "var(--critical)";
  return (
    <span className="group relative inline-flex items-center gap-3">
      <span className="inline-flex items-center gap-2" tabIndex={0} aria-label={`Quality score ${score ?? "not available yet"} out of 100`}>
        <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
          <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} strokeLinecap="round" />
        </svg>
        <span className="leading-tight"><span className="tabular block font-semibold">{score != null ? Math.round(score) : "–"}</span><span className="text-xs text-text-muted">Quality</span></span>
      </span>
      <span className="inline-flex items-center gap-1 text-text-muted"><Layers aria-hidden className="h-4 w-4" /> {streak}-layer clean streak</span>
      <span role="tooltip" className="pointer-events-none absolute left-0 top-11 z-20 hidden w-72 rounded-ctl bg-charcoal p-2 text-xs text-surface group-focus-within:block group-hover:block">
        Quality = 60 % layers within tolerance + 25 % alert response speed + 15 % AI suggestions decided before they expired.
      </span>
    </span>
  );
}

function levelFor(v: number | null | undefined, lim?: LimitOut): Level {
  if (v == null || !lim) return "ok";
  const outC = (lim.critical_min != null && v < lim.critical_min) || (lim.critical_max != null && v > lim.critical_max);
  if (outC) return "critical";
  const outN = (lim.normal_min != null && v < lim.normal_min) || (lim.normal_max != null && v > lim.normal_max);
  return outN ? "warning" : "ok";
}

const rangeText = (lim: LimitOut | undefined, unit: string, digits = 1) =>
  lim && lim.normal_min != null && lim.normal_max != null ? `Normal ${fmt(lim.normal_min, digits)}–${fmt(lim.normal_max, digits)} ${unit}` : "";

const SOURCE_LABEL: Record<string, string> = { ai_accepted: "AI accepted", ai_modified: "AI modified", manual: "Manual (engineer)" };

export function LiveMonitorPage() {
  const { sessionId } = useParams();
  const s = useSession(sessionId);
  const canEscalate = useCan("escalate");
  const canReport = useCan("view_reports");
  const watched = useAuth((x) => !!x.me?.onboarding?.first_live_watched);
  useEffect(() => { if (!watched) saveOnboarding({ first_live_watched: true }).catch(() => undefined); }, [watched]);
  const lim = Object.fromEntries((s.detail?.limits ?? []).map((l) => [l.signal, l])) as Record<string, LimitOut>;
  const r: Partial<Reading> = s.latest ?? {};
  const any = s.lastAny;
  const alert = topAlert(s.alerts);
  const levelOf = (k: SignalKey) => {
    const lvl = levelFor(r[k] as number | null | undefined, lim[k]);
    const open = Object.values(s.alerts).find((a) => a.signal === k && a.kind !== "rapid_change");
    return open?.severity === "critical" ? "critical" : open?.severity === "warning" && lvl === "ok" ? "warning" : lvl;
  };
  const lastExt = s.preds.extrusion_rate[s.preds.extrusion_rate.length - 1];
  const lastDly = s.preds.interlayer_delay[s.preds.interlayer_delay.length - 1];
  const pending = Object.values(s.recs).filter((x) => x.status === "pending").sort((a, b) => (a.parameter > b.parameter ? 1 : -1));
  const decided = Object.values(s.recs).filter((x) => x.status !== "pending").sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? "")).slice(0, 1);
  const job = s.detail?.job;
  const escalate = async () => {
    try {
      const res = await post<EscalateOut>(`/sessions/${sessionId}/escalate`, { alert_id: alert?.id ?? null, message: alert?.message ?? "Please review the live print." });
      toast({ kind: "neutral", title: "Engineer notified", body: res.message });
    } catch (e) {
      toast({ kind: "critical", title: "Could not escalate", body: e instanceof ApiError ? e.message : null });
    }
  };
  const tile = (k: SignalKey, extra: Partial<Parameters<typeof MetricTile>[0]> = {}) => {
    const m = SIGNAL_META[k];
    const l = lim[k];
    return (
      <MetricTile key={k} label={m.label} unit={m.unit} digits={m.digits} value={r[k] as number | null | undefined}
        level={levelOf(k)} range={rangeText(l, m.unit, m.digits > 1 ? 1 : m.digits)} points={s.series[k]}
        band={l ? [l.normal_min, l.normal_max] : undefined} {...extra} />
    );
  };
  const ended = s.status === "stopped" || s.status === "completed" || s.status === "aborted";
  const waiting = any?.phase === "interlayer_delay" && !ended;
  return (
    <PrintLayout>
      {s.status === "prechecking" && (
        <div className="flex items-center gap-2 bg-brand-50 px-4 py-2 text-sm text-brand-700"><ScanLine className="h-4 w-4" /> Sensor pre-check: confirming every sensor is reporting…</div>
      )}
      {(s.status === "stopped" || s.status === "completed" || s.status === "aborted") && (
        <div className={`flex items-center gap-2 px-4 py-3 text-sm ${s.status === "completed" ? "bg-ok-50 text-ok" : "bg-critical-50 text-critical"}`}>
          <strong>{s.status === "completed" ? "Print completed" : s.status === "stopped" ? "Print stopped" : "Print aborted"}</strong>
          <span className="text-text">at layer {any?.layer ?? s.detail?.current_layer}. Values below are the last readings.</span>
          {canReport && <Link to={`/sessions/${sessionId}/report`} className="ml-auto font-semibold text-brand-700 underline">Open the session report</Link>}
        </div>
      )}
      {s.status === "scheduled" && (
        <div className="m-4 rounded-card bg-surface p-4 text-sm shadow-sm sm:m-6">
          This print is ready. Press <strong>Start print</strong> below; PRIME runs a short sensor pre-check first.
        </div>
      )}
      <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card bg-surface px-4 py-3 text-sm shadow-sm">
            <span className="font-semibold">
              {ended ? `Ended at layer ${any?.layer ?? s.detail?.current_layer ?? "–"}` :
                waiting ? <><Hourglass aria-hidden className="mr-1 inline h-4 w-4 text-brand-600" />Waiting between layers</> :
                any ? `${s.status === "paused" ? "Paused on" : "Printing"} layer ${any.layer} · checkpoint ${any.checkpoint ?? "–"} of 4` : "Not started"}
            </span>
            <span className="text-text-muted"><Clock3 aria-hidden className="mr-1 inline h-4 w-4" />Print time {duration(any?.sim_t_s ?? s.detail?.sim_time_s ?? 0)}</span>
            <span className="text-text-muted">Wall height {fmt(r.total_height, 0)} mm</span>
            <QualityRing score={s.quality?.score ?? s.detail?.quality_score ?? null} streak={s.quality?.streak ?? 0} />
            {canEscalate && !ended && (
              <Button variant="secondary" className="ml-auto" onClick={escalate}><Megaphone aria-hidden className="h-4 w-4" /> Escalate to engineer</Button>
            )}
          </div>
          {/* Row 1: layer width · layer height · material temperature; row 2: motor power · pump speed · print speed; row 3: interlayer delay */}
          <div className="grid gap-4 sm:grid-cols-3" data-testid="live-tiles">
            {tile("sll_width", {
              range: job ? `Target ${job.target_layer_width_mm} ± ${job.width_tolerance_mm} mm` : "",
              size: "lg", digits: 2,
              levelLabel: levelOf("sll_width") === "ok" ? undefined : (r.sll_width ?? 0) < (job?.target_layer_width_mm ?? 0) ? "Below target" : "Above target",
            })}
            {tile("sll_height", {
              range: job ? `Target ${job.target_layer_height_mm} ± ${job.height_tolerance_mm} mm` : "",
              size: "lg", digits: 2,
              levelLabel: levelOf("sll_height") === "ok" ? undefined : (r.sll_height ?? 0) < (job?.target_layer_height_mm ?? 0) ? "Below target" : "Above target",
            })}
            {tile("temperature", { size: "lg" })}
            {tile("motor_power", { range: "Duty × voltage × current, as a positive value" })}
            {tile("pump_rpm", {
              ai: lastExt && Math.abs(lastExt.value - (r.pump_rpm ?? lastExt.value)) >= 1 ? `Model ${fmt(lastExt.value, 0)} RPM` : lastExt ? "Model agrees" : undefined,
            })}
            {tile("print_speed", { secondary: <>Nozzle {s.detail?.printer?.nozzle ?? "–"} · flow {fmt(r.flow, 0)} mm³/s</> })}
            <MetricTile label="Interlayer delay" unit="min" digits={0} value={any?.delay_setting_min ?? s.detail?.current_delay_min}
              level="ok" levelLabel="Setting" range="Wait before the next layer"
              ai={lastDly ? `Model ${lastDly.value} min · ${Math.round((lastDly.confidence ?? 0) * 100)}%` : undefined} />
          </div>
        </div>
        <aside className="space-y-4" aria-label="AI and adjustments">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">AI suggestions</h2>
          {pending.length === 0 && (
            <p className="rounded-card bg-surface p-4 text-sm text-text-muted shadow-sm">
              No suggestions right now. The models check every vision checkpoint (4 per layer).
            </p>
          )}
          {pending.map((rec) => <AiRecommendationCard key={rec.id} rec={rec} onEscalate={canEscalate ? escalate : undefined} />)}
          {decided.map((rec) => <AiRecommendationCard key={rec.id} rec={rec} compact />)}
          <div className="rounded-card bg-surface p-4 shadow-sm">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Wrench aria-hidden className="h-4 w-4 text-brand-600" /> Adjustment log</p>
            {s.adjustments.length === 0 ? <p className="text-sm text-text-muted">No changes yet.</p> : (
              <ul className="space-y-2 text-sm">
                {[...s.adjustments].reverse().slice(0, 5).map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span>
                      <span className="font-medium">{SIGNAL_META[a.parameter === "interlayer_delay" ? "delay_setting_min" : a.parameter].label}</span>{" "}
                      {fmt(a.from_value, 0)} → {fmt(a.to_value, 0)}
                      <span className="block text-xs text-text-muted">{SOURCE_LABEL[a.source]} · {a.user_name ?? ""}</span>
                    </span>
                    <span className="text-right text-xs text-text-muted">{a.applied_at_layer ? `Applied L${a.applied_at_layer}` : "Queued for next layer"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </PrintLayout>
  );
}
