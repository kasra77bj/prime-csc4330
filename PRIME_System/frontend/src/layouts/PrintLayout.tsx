import { ArrowLeft, PauseCircle, Sparkles } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { post } from "../api/client";
import { AlertBanner, topAlert } from "../components/AlertBanner";
import { ControlBar } from "../components/ControlBar";
import { toast } from "../components/Toaster";
import { useSessionStream } from "../hooks/useSessionStream";
import { mutedNudges } from "../lib/prefs";
import { useCan } from "../store/auth";
import { useSession, type LiveSession } from "../store/live";

const UNACK_AFTER_MS = 30_000;

/** Nudge (docs/17 §9): a warning left unacknowledged for 30 s gets one gentle reminder, never while a critical
 *  alert is open (the red banner already has the operator's attention). */
function useUnackNudge(sessionId: string | undefined, s: LiveSession) {
  const shown = useRef(new Set<string>());
  const canAck = useCan("acknowledge_alert");
  const canEscalate = useCan("escalate");
  useEffect(() => {
    if (!sessionId || !canAck) return;
    const t = setInterval(() => {
      const open = Object.values(s.alerts).filter((a) => a.status === "open");
      if (open.some((a) => a.severity === "critical") || mutedNudges().has("unack")) return;
      const late = open.find((a) => a.severity === "warning" && !shown.current.has(a.id) && Date.now() - new Date(a.raised_at).getTime() > UNACK_AFTER_MS);
      if (!late) return;
      shown.current.add(late.id);
      const label = late.message.split(" ").slice(0, 2).join(" ");
      toast({
        kind: "warning", title: `${label} warning has been open for 30 s`, body: "Acknowledge it, or escalate to the engineer.",
        actions: [
          { label: "Acknowledge", onClick: () => { post(`/alerts/${late.id}/acknowledge`).catch(() => undefined); } },
          ...(canEscalate ? [{ label: "Escalate", onClick: () => { post(`/sessions/${sessionId}/escalate`, { alert_id: late.id, message: late.message }).then(() => toast({ kind: "neutral", title: "Engineer notified", body: "They usually respond in about 2 minutes." })).catch(() => undefined); } }] : []),
        ],
      });
    }, 2000);
    return () => clearInterval(t);
  }, [sessionId, s.alerts, canAck, canEscalate]);
}
import { AppShell } from "./AppShell";

const TABS = [["live", "Live"], ["vision", "Vision"], ["trends", "Trends"], ["ai", "AI"]] as const;

/** Every /prints/:sessionId/* page: tabs on top, persistent ControlBar at the bottom (US-07). */
export function PrintLayout({ children }: { children: ReactNode }) {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const { pathname } = useLocation();
  useSessionStream(sessionId);
  const s = useSession(sessionId);
  useUnackNudge(sessionId, s);
  const d = s.detail;
  const layer = s.lastAny?.layer ?? d?.current_layer ?? 0;
  const title = d ? `${d.job_name} · ${d.printer_name}` : "Loading print…";
  return (
    <AppShell quietSession={sessionId} title={title} subtitle={d ? `Job ${d.job_code} · ${d.job?.mixture ?? ""} · nozzle ${d.printer?.nozzle ?? ""}` : undefined}
      actions={<button type="button" onClick={() => nav("/dashboard")} className="hidden items-center gap-1 rounded-ctl px-2 py-1 text-sm text-text-muted hover:bg-canvas md:inline-flex"><ArrowLeft className="h-4 w-4" /> Dashboard</button>}>
      <nav className="no-print flex gap-1 border-b border-border bg-surface px-4 sm:px-6" aria-label="Print views">
        {TABS.map(([path, label]) => (
          <NavLink key={path} to={`/prints/${sessionId}/${path}`}
            className={({ isActive }) => `border-b-2 px-4 py-3 text-sm font-medium ${isActive ? "border-brand-600 text-brand-700" : "border-transparent text-text-muted hover:text-text"}`}>
            {label}
          </NavLink>
        ))}
      </nav>
      {(() => {   // the print's highest open alert, on every print tab (US-06)
        const a = topAlert(s.alerts);
        const geo = a?.signal === "sll_width" || a?.signal === "sll_height";
        return <AlertBanner alert={a} onView={geo && !pathname.endsWith("/vision") ? () => nav(`/prints/${sessionId}/vision`) : undefined} />;
      })()}
      {s.status === "paused" && d?.auto_paused && (   // critical alert -> the runner paused the print and waits for a decision
        <div role="alert" data-testid="auto-pause-banner" className="no-print flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-critical bg-critical-50 px-4 py-3 text-sm sm:px-6">
          <PauseCircle aria-hidden className="h-5 w-5 shrink-0 text-critical" />
          <span className="font-semibold text-critical">Print paused automatically</span>
          <span className="text-text">PRIME paused this print because of a critical alert, so the team can review it. Accept or modify the AI suggestion to continue (the operator can also press Resume).</span>
          {!pathname.endsWith("/ai") && (
            <button type="button" onClick={() => nav(`/prints/${sessionId}/ai`)}
              className="ml-auto inline-flex items-center gap-1 rounded-ctl bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700">
              <Sparkles aria-hidden className="h-4 w-4" /> Review AI suggestion
            </button>
          )}
        </div>
      )}
      <div className="flex-1">{children}</div>
      {sessionId && (
        <ControlBar sessionId={sessionId} status={s.status} title={d ? `${d.job_name}` : ""} layer={layer} totalLayers={d?.total_layers ?? null} />
      )}
    </AppShell>
  );
}

export function ComingNext({ title, text }: { title: string; text: string }) {
  return (
    <div className="m-6 rounded-card border border-dashed border-border bg-surface p-10 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-sm text-text-muted">{text}</p>
    </div>
  );
}
