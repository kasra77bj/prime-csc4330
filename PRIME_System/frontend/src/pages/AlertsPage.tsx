import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, get, post } from "../api/client";
import type { AlertOut, EscalateOut, WsEnvelope } from "../api/types";
import { Button } from "../components/Button";
import { Sparkline } from "../components/Sparkline";
import { StatusPill } from "../components/StatusPill";
import { toast } from "../components/Toaster";
import { AppShell } from "../layouts/AppShell";
import { clock, fmt, SIGNAL_META } from "../lib/format";
import { useAuth, useCan } from "../store/auth";
import { socket } from "../ws/socket";

const STATUSES = [["open", "Open"], ["acknowledged", "Acknowledged"], ["resolved", "Resolved"], ["", "All"]] as const;
const SEVERITIES = [["", "All severities"], ["critical", "Critical"], ["warning", "Warning"], ["info", "Info"]] as const;
const STATUS_LEVEL = { open: "warning", acknowledged: "info", resolved: "ok" } as const;

/** The signal around the alert: layers before/after it, averaged every 5 s of print time. */
function AlertChart({ a }: { a: AlertOut }) {
  const sig = a.signal in SIGNAL_META ? a.signal : null;
  const q = useQuery({
    queryKey: ["alert-chart", a.id], enabled: !!sig,
    queryFn: () => get<{ points: { t_s: number; layer: number; [k: string]: number | null }[] }>(`/sessions/${a.session_id}/readings?signals=${sig}&from_s=0&bucket=5s`),
  });
  if (!sig) return <p className="text-sm text-text-muted">No chart for this signal.</p>;
  const pts = (q.data?.points ?? []).filter((p) => p.layer >= a.layer_no - 1 && p.layer <= a.layer_no + 1 && p[sig] != null).map((p) => ({ t: p.t_s, v: p[sig] as number }));
  return (
    <div>
      <p className="mb-1 text-xs text-text-muted">{SIGNAL_META[sig as keyof typeof SIGNAL_META].label}, layers {a.layer_no - 1}–{a.layer_no + 1}{a.threshold != null ? ` · threshold ${fmt(a.threshold, 2)}` : ""}</p>
      {q.isLoading ? <p className="text-sm text-text-muted">Loading…</p> : <Sparkline points={pts} height={64} />}
    </div>
  );
}

export function AlertsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useAuth((s) => s.me);
  const canAck = useCan("acknowledge_alert");
  const canResolve = useCan("resolve_alert");
  const canEscalate = useCan("escalate");
  const [status, setStatus] = useState<string>("open");
  const [severity, setSeverity] = useState<string>("");
  const [open, setOpen] = useState<string | null>(null);
  const params = new URLSearchParams({ limit: "200", ...(status ? { status } : {}), ...(severity ? { severity } : {}) });
  const q = useQuery({ queryKey: ["alerts", "center", status, severity], queryFn: () => get<AlertOut[]>(`/alerts?${params}`), refetchInterval: 5000 });
  const siteId = me?.sites[0]?.id;
  useEffect(() => {
    if (!siteId) return;
    const unsub = socket.subscribe(`site:${siteId}`);
    const off = socket.on((m: WsEnvelope) => { if (m.channel === `site:${siteId}` && m.type === "alert") qc.invalidateQueries({ queryKey: ["alerts"] }); });
    return () => { off(); unsub(); };
  }, [siteId, qc]);
  const act = async (a: AlertOut, what: "acknowledge" | "resolve" | "escalate") => {
    try {
      if (what === "escalate") {
        const r = await post<EscalateOut>(`/sessions/${a.session_id}/escalate`, { alert_id: a.id, message: a.message });
        toast({ kind: "neutral", title: "Engineer notified", body: r.message });
      } else {
        await post(`/alerts/${a.id}/${what}`);
        qc.invalidateQueries({ queryKey: ["alerts"] });
      }
    } catch (e) {
      toast({ kind: "critical", title: `Could not ${what}`, body: e instanceof ApiError ? e.message : null });
    }
  };
  const rows = q.data ?? [];
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm font-medium ${on ? "border-brand-600 bg-brand-50 text-brand-700" : "border-border bg-surface text-text-muted"}`;
  return (
    <AppShell title="Alerts" subtitle="Every out-of-range, sensor and rapid-change alert across your printers">
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map(([v, l]) => <button key={l} type="button" aria-pressed={status === v} className={chip(status === v)} onClick={() => setStatus(v)}>{l}</button>)}
          <span className="mx-2 h-5 w-px bg-border" aria-hidden />
          {SEVERITIES.map(([v, l]) => <button key={l} type="button" aria-pressed={severity === v} className={chip(severity === v)} onClick={() => setSeverity(v)}>{l}</button>)}
        </div>
        <div className="overflow-x-auto rounded-card bg-surface shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-text-muted">
              <tr><th className="w-8 p-3" /><th className="p-3 font-medium">Severity</th><th className="p-3 font-medium">Signal</th><th className="p-3 font-medium">Message</th><th className="p-3 font-medium">Print</th><th className="p-3 font-medium">Raised</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Owner</th><th className="p-3 font-medium"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-text-muted">{q.isLoading ? "Loading alerts…" : status === "open" ? "No open alerts. Every print is within its limits." : "No alerts match these filters."}</td></tr>}
              {rows.map((a) => (
                <Fragment key={a.id}>
                  <tr className="border-t border-border align-top">
                    <td className="p-3">
                      <button type="button" aria-label={open === a.id ? "Hide chart" : "Show chart"} aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)} className="rounded p-1 text-text-muted hover:bg-canvas">
                        {open === a.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="p-3"><StatusPill level={a.severity === "critical" ? "critical" : a.severity === "warning" ? "warning" : "info"} label={a.severity[0].toUpperCase() + a.severity.slice(1)} /></td>
                    <td className="p-3">{SIGNAL_META[a.signal as keyof typeof SIGNAL_META]?.label ?? a.signal}</td>
                    <td className="max-w-[360px] p-3">{a.message}</td>
                    <td className="p-3"><span className="block">{a.job_name ?? "–"}</span><span className="text-xs text-text-muted">{a.printer_name} · layer {a.layer_no}</span></td>
                    <td className="tabular p-3">{clock(a.raised_at)}</td>
                    <td className="p-3"><StatusPill level={STATUS_LEVEL[a.status]} label={a.status[0].toUpperCase() + a.status.slice(1)} /></td>
                    <td className="p-3 text-text-muted">{a.acknowledged_by_name ?? (a.status === "resolved" ? "Auto-resolved" : "–")}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {canAck && a.status === "open" && <Button onClick={() => act(a, "acknowledge")}>Acknowledge</Button>}
                        {canEscalate && a.status !== "resolved" && <Button variant="secondary" onClick={() => act(a, "escalate")}>Escalate</Button>}
                        {canResolve && a.status !== "resolved" && <Button variant="secondary" onClick={() => act(a, "resolve")}>Resolve</Button>}
                        <Button variant="ghost" onClick={() => nav(`/prints/${a.session_id}/live`)}>Open print</Button>
                      </div>
                    </td>
                  </tr>
                  {open === a.id && <tr><td /><td colSpan={8} className="px-3 pb-4"><AlertChart a={a} /></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-text-muted">Alerts resolve on their own after 10 readings back in range. Acknowledging tells the team someone is on it.</p>
      </div>
    </AppShell>
  );
}
