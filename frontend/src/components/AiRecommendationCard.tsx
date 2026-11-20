import { Check, Minus, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { ApiError, post } from "../api/client";
import type { DelayEffect, Recommendation, RejectReason, WidthEffect } from "../api/types";
import { useCan } from "../store/auth";
import { Button } from "./Button";
import { EffectChart } from "./EffectChart";
import { LockedButton } from "./LockedButton";
import { toast } from "./Toaster";

const REASONS: { v: RejectReason; label: string }[] = [
  { v: "sensor_artifact", label: "Sensor or camera artifact" },
  { v: "material_change", label: "Material change planned" },
  { v: "disagree_model", label: "I disagree with the model" },
  { v: "other", label: "Other" },
];
const STATUS_TEXT: Record<string, string> = {
  accepted: "Accepted", modified: "Modified", rejected: "Rejected", expired: "Expired", superseded: "Replaced by a manual change",
};

/** AI suggestion card (US-09/US-10): what, why, predicted effect, confidence, Accept / Modify / Reject.
 *  Operators see it read-only with a lock and an Escalate action. */
export function AiRecommendationCard({ rec, onEscalate, compact = false }: {
  rec: Recommendation; onEscalate?: () => void; compact?: boolean;
}) {
  const canDecide = useCan("decide_recommendation");
  const [mode, setMode] = useState<"view" | "modify" | "reject">("view");
  const step = rec.parameter === "pump_rpm" ? 1 : rec.parameter === "interlayer_delay" ? 0 : 1;
  const [value, setValue] = useState(rec.proposed_value);
  const [reason, setReason] = useState<RejectReason>("disagree_model");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const unit = rec.parameter === "pump_rpm" ? "RPM" : rec.parameter === "interlayer_delay" ? "min" : "mm/s";
  const pending = rec.status === "pending";

  const send = async (action: "accept" | "modify" | "reject") => {
    setBusy(true);
    try {
      const body = action === "accept" ? {} : action === "modify" ? { final_value: value, note: note || null } : { reason, note: note || null };
      await post(`/recommendations/${rec.id}/${action}`, body);
      toast({
        kind: action === "reject" ? "neutral" : "success",
        title: action === "reject" ? "Suggestion rejected" : `Change queued: ${action === "accept" ? rec.proposed_value : value} ${unit}`,
        body: action === "reject" ? "Logged with your reason." : "It applies at the start of the next layer.",
      });
      setMode("view");
    } catch (e) {
      toast({ kind: "critical", title: "Could not save the decision", body: e instanceof ApiError ? e.message : null });
    } finally {
      setBusy(false);
    }
  };

  const effect = rec.predicted_effect;
  const conf = Math.round((rec.confidence ?? 0) * 100);
  return (
    <article className="rounded-card border-l-4 border-brand-600 bg-brand-50 p-4 shadow-sm" aria-label="AI suggestion">
      <header className="flex items-start justify-between gap-2">
        <div>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-brand-700">
            <Sparkles aria-hidden className="h-3.5 w-3.5" /> AI suggestion · layer {rec.created_at_layer}
          </span>
          <h3 className="mt-2 text-lg font-semibold">{rec.title}</h3>
        </div>
        {!pending && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-text-muted">
            {STATUS_TEXT[rec.status]}{rec.final_value != null && rec.status === "modified" ? ` (${rec.final_value} ${unit})` : ""}
          </span>
        )}
      </header>
      <div className="mt-2">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>Confidence</span><span className="tabular font-medium text-text">{conf}%</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-surface">
          <div className="h-full rounded-full bg-viz-violet" style={{ width: `${conf}%` }} />
        </div>
      </div>
      {!compact && (
        <>
          <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Why</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {rec.reason_lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
          {effect && effect.signal === "sll_width" && (
            <>
              <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Predicted effect (next 3 checkpoints)</h4>
              <EffectChart e={effect as WidthEffect} />
            </>
          )}
          {effect && effect.signal === "interlayer_delay" && (
            <p className="mt-3 text-sm">
              Wait <strong>{(effect as DelayEffect).proposed} min</strong> instead of {(effect as DelayEffect).current} min before the next layer.
            </p>
          )}
          {rec.risk_text && <p className="mt-2 text-xs text-text-muted">Risk: {rec.risk_text}</p>}
        </>
      )}
      {pending && (
        <div className="mt-3">
          {!canDecide ? (
            <div className="flex flex-wrap items-center gap-2">
              <LockedButton>Accept</LockedButton>
              {onEscalate && <Button variant="secondary" onClick={onEscalate}>Escalate to engineer</Button>}
            </div>
          ) : mode === "view" ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => send("accept")} disabled={busy}><Check aria-hidden className="h-4 w-4" /> Accept</Button>
              <Button variant="secondary" onClick={() => { setValue(rec.proposed_value); setMode("modify"); }} disabled={busy}>Modify</Button>
              <Button variant="ghost" onClick={() => setMode("reject")} disabled={busy}><X aria-hidden className="h-4 w-4" /> Reject</Button>
            </div>
          ) : mode === "modify" ? (
            <div className="space-y-2 rounded-ctl bg-surface p-3">
              <label className="text-sm font-medium" htmlFor={`v-${rec.id}`}>New value ({unit})</label>
              {rec.parameter === "interlayer_delay" ? (
                <div className="flex gap-2">
                  {[1, 5, 10].map((m) => (
                    <Button key={m} variant={value === m ? "primary" : "secondary"} onClick={() => setValue(m)}>{m} min</Button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="secondary" aria-label="Decrease" onClick={() => setValue((v) => v - (step || 1))}><Minus className="h-4 w-4" /></Button>
                  <input id={`v-${rec.id}`} type="number" value={value} onChange={(e) => setValue(Number(e.target.value))}
                    className="tabular w-24 rounded-ctl border border-border px-2 py-2 text-center text-lg font-semibold" />
                  <Button variant="secondary" aria-label="Increase" onClick={() => setValue((v) => v + (step || 1))}><Plus className="h-4 w-4" /></Button>
                  <span className="text-sm text-text-muted">now {rec.current_value} {unit}</span>
                </div>
              )}
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
                className="w-full rounded-ctl border border-border px-2 py-2 text-sm" />
              <div className="flex gap-2">
                <Button onClick={() => send("modify")} disabled={busy}>Apply {value} {unit}</Button>
                <Button variant="ghost" onClick={() => setMode("view")}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-ctl bg-surface p-3">
              <label className="text-sm font-medium" htmlFor={`r-${rec.id}`}>Why are you rejecting it?</label>
              <select id={`r-${rec.id}`} value={reason} onChange={(e) => setReason(e.target.value as RejectReason)}
                className="w-full rounded-ctl border border-border px-2 py-2 text-sm">
                {REASONS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
                className="w-full rounded-ctl border border-border px-2 py-2 text-sm" />
              <div className="flex gap-2">
                <Button variant="danger" onClick={() => send("reject")} disabled={busy}>Reject suggestion</Button>
                <Button variant="ghost" onClick={() => setMode("view")}>Cancel</Button>
              </div>
            </div>
          )}
          <p className="mt-2 text-[11px] text-text-muted">Changes apply at the next layer start and are logged to the audit trail.</p>
        </div>
      )}
    </article>
  );
}
