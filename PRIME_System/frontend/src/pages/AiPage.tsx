import { Lock, Minus, Plus, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, post } from "../api/client";
import type { Adjustment, AdjustParam, Recommendation } from "../api/types";
import { AiRecommendationCard } from "../components/AiRecommendationCard";
import { Button } from "../components/Button";
import { LockedButton } from "../components/LockedButton";
import { toast } from "../components/Toaster";
import { PrintLayout } from "../layouts/PrintLayout";
import { clock, fmt } from "../lib/format";
import { useAuth, useCan } from "../store/auth";
import { useSession } from "../store/live";

type Tab = "pending" | "accepted" | "rejected" | "manual";
const TAB_LABEL: Record<Tab, string> = { pending: "Pending", accepted: "Accepted", rejected: "Rejected & expired", manual: "Manual" };
const PARAMS: { v: AdjustParam; label: string; unit: string; step: number }[] = [
  { v: "pump_rpm", label: "Pump speed", unit: "RPM", step: 1 },
  { v: "print_speed", label: "Print speed", unit: "mm/s", step: 1 },
  { v: "interlayer_delay", label: "Interlayer delay", unit: "min", step: 0 },
];
const SOURCE: Record<Adjustment["source"], string> = { ai_accepted: "AI accepted", ai_modified: "AI modified", manual: "Manual (independent decision)" };
const REASON: Record<string, string> = { sensor_artifact: "Sensor or camera artifact", material_change: "Material change planned", disagree_model: "Disagreed with the model", other: "Other" };
const unitOf = (p: AdjustParam) => PARAMS.find((x) => x.v === p)!.unit;

function tabOf(r: Recommendation): Tab {
  return r.status === "pending" ? "pending" : r.status === "accepted" || r.status === "modified" ? "accepted" : "rejected";
}

/** US-11: adjust without (or against) the AI. Always logged as an independent engineer decision. */
function ManualDrawer({ sessionId, current, onClose }: { sessionId: string; current: Record<AdjustParam, number | null>; onClose: () => void }) {
  const [param, setParam] = useState<AdjustParam>("pump_rpm");
  const meta = PARAMS.find((p) => p.v === param)!;
  const [value, setValue] = useState<number>(current.pump_rpm ?? 30);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const pick = (p: AdjustParam) => { setParam(p); setValue(current[p] ?? (p === "interlayer_delay" ? 5 : 10)); };
  const apply = async () => {
    setBusy(true);
    try {
      await post(`/sessions/${sessionId}/adjustments`, { parameter: param, to_value: value, note });
      toast({ kind: "success", title: `Manual change queued: ${meta.label} ${value} ${meta.unit}`, body: "Applies at the next layer start. Logged as an independent engineer decision." });
      onClose();
    } catch (e) {
      toast({ kind: "critical", title: "Could not apply the change", body: e instanceof ApiError ? e.message : null });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end backdrop" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="manual-title" className="flex h-full w-[420px] max-w-full flex-col gap-4 overflow-auto bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 id="manual-title" className="text-lg font-semibold">Adjust without AI recommendation</h2>
            <p className="text-sm text-text-muted">Use your judgment when you know something the model does not.</p>
          </div>
          <Button variant="ghost" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <label className="text-sm font-medium" htmlFor="m-param">Parameter</label>
        <select id="m-param" value={param} onChange={(e) => pick(e.target.value as AdjustParam)} className="-mt-3 rounded-ctl border border-border px-2 py-2 text-sm">
          {PARAMS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
        </select>
        <div>
          <p className="text-sm font-medium">New value <span className="font-normal text-text-muted">(now {fmt(current[param], 0)} {meta.unit})</span></p>
          {param === "interlayer_delay" ? (
            <div className="mt-2 flex gap-2">
              {[1, 5, 10].map((m) => <Button key={m} variant={value === m ? "primary" : "secondary"} onClick={() => setValue(m)}>{m} min</Button>)}
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <Button variant="secondary" aria-label="Decrease" onClick={() => setValue((v) => v - meta.step)}><Minus className="h-4 w-4" /></Button>
              <input type="number" aria-label="New value" value={value} onChange={(e) => setValue(Number(e.target.value))} className="tabular w-24 rounded-ctl border border-border px-2 py-2 text-center text-lg font-semibold" />
              <Button variant="secondary" aria-label="Increase" onClick={() => setValue((v) => v + meta.step)}><Plus className="h-4 w-4" /></Button>
              <span className="text-sm text-text-muted">{meta.unit}</span>
            </div>
          )}
        </div>
        <label className="text-sm font-medium" htmlFor="m-note">Note <span className="font-normal text-critical">(required)</span></label>
        <textarea id="m-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Why are you making this change?"
          className="-mt-3 rounded-ctl border border-border px-2 py-2 text-sm" />
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input type="checkbox" checked disabled className="h-4 w-4" /> Log as independent engineer decision (always on)
        </label>
        <Button onClick={apply} disabled={busy || note.trim().length < 3}>Apply at next layer</Button>
        <p className="text-xs text-text-muted">If an AI suggestion for the same parameter is waiting, it is marked as replaced by your decision.</p>
      </div>
    </div>
  );
}

export function AiPage() {
  const { sessionId } = useParams();
  const s = useSession(sessionId);
  const me = useAuth((x) => x.me);
  const canDecide = useCan("decide_recommendation");
  const canManual = useCan("manual_adjust");
  const canEscalate = useCan("escalate");
  const [tab, setTab] = useState<Tab>("pending");
  const [picked, setPicked] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {   // the engineer is looking: open escalations are answered ("Dev is reviewing")
    if (canDecide && sessionId) post(`/sessions/${sessionId}/escalations/seen`).catch(() => undefined);
  }, [canDecide, sessionId]);
  const recs = Object.values(s.recs).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const manual = s.adjustments.filter((a) => a.source === "manual").reverse();
  const counts: Record<Tab, number> = { pending: 0, accepted: 0, rejected: 0, manual: manual.length };
  recs.forEach((r) => { counts[tabOf(r)] += 1; });
  const list = recs.filter((r) => tabOf(r) === tab);
  const sel = (picked ? s.recs[picked] : undefined) ?? list[0];
  const adjFor = (r: Recommendation) => s.adjustments.find((a) => a.recommendation_id === r.id);
  const escalate = async () => {
    try {
      const r = await post<{ message: string }>(`/sessions/${sessionId}/escalate`, { message: "Please review the AI suggestion." });
      toast({ kind: "neutral", title: "Engineer notified", body: r.message });
    } catch (e) {
      toast({ kind: "critical", title: "Could not escalate", body: e instanceof ApiError ? e.message : null });
    }
  };
  const current = { pump_rpm: s.latest?.pump_rpm ?? s.detail?.current_rpm ?? null, print_speed: s.latest?.print_speed ?? s.detail?.current_speed ?? null, interlayer_delay: s.lastAny?.delay_setting_min ?? s.detail?.current_delay_min ?? null };
  const active = s.status === "running" || s.status === "paused" || s.status === "prechecking";
  return (
    <PrintLayout>
      <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[360px_1fr]">
        <section aria-label="Suggestions" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">AI suggestions</h2>
            {canManual ? <Button variant="secondary" onClick={() => setDrawer(true)} disabled={!active}><SlidersHorizontal aria-hidden className="h-4 w-4" /> Manual adjust</Button>
              : <LockedButton>Manual adjust</LockedButton>}
          </div>
          <div role="tablist" className="flex gap-1 rounded-ctl bg-surface p-1 shadow-sm">
            {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => { setTab(t); setPicked(null); }}
                className={`flex-1 rounded-ctl px-2 py-2 text-sm font-medium ${tab === t ? "bg-brand-50 text-brand-700" : "text-text-muted hover:text-text"}`}>
                {TAB_LABEL[t]} ({counts[t]})
              </button>
            ))}
          </div>
          <ul className="space-y-2">
            {tab !== "manual" && list.length === 0 && <li className="rounded-card bg-surface p-4 text-sm text-text-muted shadow-sm">{tab === "pending" ? "No suggestions waiting. The models check every vision checkpoint (4 per layer)." : "Nothing here yet."}</li>}
            {tab !== "manual" && list.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setPicked(r.id)} aria-current={sel?.id === r.id}
                  className={`w-full rounded-card border-l-4 p-3 text-left shadow-sm ${sel?.id === r.id ? "border-brand-600 bg-brand-50" : "border-transparent bg-surface hover:bg-canvas"}`}>
                  <span className="flex items-center justify-between text-xs text-text-muted">
                    <span>Layer {r.created_at_layer} · {clock(r.created_at)}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 font-medium text-brand-700"><Sparkles aria-hidden className="h-3 w-3" />{Math.round((r.confidence ?? 0) * 100)} %</span>
                  </span>
                  <span className="mt-1 block font-semibold">{r.title}</span>
                  {r.status !== "pending" && <span className="text-xs text-text-muted">{r.status === "modified" ? `Modified to ${r.final_value} ${unitOf(r.parameter)}` : r.status === "superseded" ? "Replaced by a manual change" : r.status[0].toUpperCase() + r.status.slice(1)}</span>}
                </button>
              </li>
            ))}
            {tab === "manual" && manual.length === 0 && <li className="rounded-card bg-surface p-4 text-sm text-text-muted shadow-sm">No manual changes in this print.</li>}
            {tab === "manual" && manual.map((a) => (
              <li key={a.id} className="rounded-card bg-surface p-3 text-sm shadow-sm">
                <p className="font-semibold">{PARAMS.find((p) => p.v === a.parameter)?.label} {fmt(a.from_value, 0)} → {fmt(a.to_value, 0)} {unitOf(a.parameter)}</p>
                <p className="text-xs text-text-muted">{a.user_name} · layer {a.requested_at_layer} · {a.applied_at_layer ? `applied at layer ${a.applied_at_layer}` : "queued for the next layer"}</p>
                {a.note && <p className="mt-1">“{a.note}”</p>}
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Suggestion detail" className="space-y-4">
          {sel && tab !== "manual" ? (
            <>
              <AiRecommendationCard key={sel.id} rec={sel} onEscalate={canEscalate ? escalate : undefined} />
              {sel.status !== "pending" && (
                <div className="rounded-card bg-surface p-4 text-sm shadow-sm">
                  <p className="font-semibold">Decision</p>
                  {sel.status === "rejected" && <p>Rejected at {clock(sel.decided_at)} · reason: {REASON[sel.reject_reason ?? "other"]}{sel.reject_note ? ` · “${sel.reject_note}”` : ""}</p>}
                  {(sel.status === "accepted" || sel.status === "modified") && (() => {
                    const a = adjFor(sel);
                    return <p>{a?.user_name ?? "An engineer"} {sel.status === "accepted" ? "accepted" : `changed it to ${sel.final_value} ${unitOf(sel.parameter)} and applied it`} at {clock(sel.decided_at)}. {a?.applied_at_layer ? `Applied at layer ${a.applied_at_layer}.` : "Waiting for the next layer."}</p>;
                  })()}
                  {sel.status === "expired" && <p>Nobody decided before layer {sel.expires_at_layer} ended, so it expired.</p>}
                  {sel.status === "superseded" && <p>An engineer made a manual change to the same parameter instead (see the Manual tab).</p>}
                </div>
              )}
              {sel.status === "pending" && canDecide && (
                <p className="text-xs text-text-muted">Changes apply at the next layer start. Logged to the audit trail as <strong>{me?.full_name} · Engineer</strong>.</p>
              )}
              {sel.status === "pending" && !canDecide && (
                <p className="flex items-center gap-2 text-sm text-text-muted"><Lock aria-hidden className="h-4 w-4" /> Engineer approval required. You can escalate so the engineer reviews it now.</p>
              )}
            </>
          ) : (
            <div className="rounded-card border border-dashed border-border bg-surface p-10 text-center text-sm text-text-muted">
              {tab === "manual" ? "Manual changes are listed on the left. Use Manual adjust to make one." : "Select a suggestion to see why the AI proposes it and what it expects to happen."}
            </div>
          )}
          <div className="rounded-card bg-surface p-4 shadow-sm">
            <p className="mb-2 text-sm font-semibold">Adjustment log</p>
            {s.adjustments.length === 0 ? <p className="text-sm text-text-muted">No changes yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-text-muted"><tr><th className="py-1 font-medium">Requested</th><th className="font-medium">By</th><th className="font-medium">Type</th><th className="font-medium">Change</th><th className="font-medium">Applied</th><th className="font-medium">Note</th></tr></thead>
                  <tbody>
                    {[...s.adjustments].reverse().map((a) => (
                      <tr key={a.id} className="border-t border-border">
                        <td className="py-2">Layer {a.requested_at_layer}</td>
                        <td>{a.user_name}</td>
                        <td>{SOURCE[a.source]}</td>
                        <td className="tabular">{PARAMS.find((p) => p.v === a.parameter)?.label} {fmt(a.from_value, 0)} → {fmt(a.to_value, 0)} {unitOf(a.parameter)}</td>
                        <td>{a.applied_at_layer ? `Layer ${a.applied_at_layer}` : active ? "Queued" : "Not applied (print ended)"}</td>
                        <td className="max-w-[220px] truncate text-text-muted" title={a.note ?? ""}>{a.note ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
      {drawer && sessionId && <ManualDrawer sessionId={sessionId} current={current} onClose={() => setDrawer(false)} />}
    </PrintLayout>
  );
}
