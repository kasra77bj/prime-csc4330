import { OctagonAlert, TriangleAlert, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, post } from "../api/client";
import type { AlertOut } from "../api/types";
import { useCan } from "../store/auth";
import { Button } from "./Button";
import { toast } from "./Toaster";

const RANK = { critical: 3, warning: 2, info: 1 } as const;

export function topAlert(alerts: Record<string, AlertOut>): AlertOut | null {
  const list = Object.values(alerts).filter((a) => a.status !== "resolved");
  list.sort((a, b) => RANK[b.severity] - RANK[a.severity] || b.raised_at.localeCompare(a.raised_at));
  return list[0] ?? null;
}

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ${s % 60}s ago`;
}

/** Highest-severity open alert for the print (US-06). */
export function AlertBanner({ alert, onView }: { alert: AlertOut | null; onView?: () => void }) {
  const canAck = useCan("acknowledge_alert");
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (!alert) return null;
  const crit = alert.severity === "critical";
  const Icon = crit ? OctagonAlert : alert.severity === "warning" ? TriangleAlert : Info;
  const cls = crit ? "bg-critical-50 border-critical" : alert.severity === "warning" ? "bg-warn-50 border-viz-ochre" : "bg-brand-50 border-brand-600";
  const ack = async () => {
    try {
      await post(`/alerts/${alert.id}/acknowledge`);
    } catch (e) {
      toast({ kind: "critical", title: "Could not acknowledge", body: e instanceof ApiError ? e.message : null });
    }
  };
  return (
    <div role="alert" className={`flex flex-wrap items-center gap-3 border-l-4 px-4 py-3 ${cls}`}>
      <Icon aria-hidden className={`h-6 w-6 shrink-0 ${crit ? "text-critical" : alert.severity === "warning" ? "text-viz-ochre" : "text-brand-600"}`} />
      <div className="min-w-[240px] flex-1">
        <p className="text-sm font-semibold">
          {crit ? "Critical" : alert.severity === "warning" ? "Warning" : "Info"} · Layer {alert.layer_no}
          {alert.status === "acknowledged" && <span className="ml-2 font-normal text-text-muted">(acknowledged)</span>}
        </p>
        <p className="text-sm">{alert.message}</p>
      </div>
      <span className="text-xs text-text-muted">{ago(alert.raised_at)}</span>
      {onView && <Button variant="secondary" onClick={onView}>View</Button>}
      {canAck && alert.status === "open" && <Button onClick={ack}>Acknowledge</Button>}
    </div>
  );
}
