import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { ApiError, post } from "../api/client";
import type { SessionStatus } from "../api/types";
import { useCan } from "../store/auth";
import { Button } from "./Button";
import { HoldToStopButton } from "./HoldToStopButton";
import { LockedButton } from "./LockedButton";
import { toast } from "./Toaster";

/** Persistent safety controls on every print page (US-07). Never hidden, never covered. */
export function ControlBar({ sessionId, status, title, layer, totalLayers }: {
  sessionId: string; status: SessionStatus | null; title: string; layer: number; totalLayers: number | null;
}) {
  const canControl = useCan("control_session");
  const [busy, setBusy] = useState(false);
  const act = async (action: "start" | "pause" | "resume" | "stop") => {
    setBusy(true);
    try {
      await post(`/sessions/${sessionId}/${action}`, action === "stop" ? { reason: "Stopped from the control bar" } : {});
      if (action === "stop") toast({ kind: "neutral", title: "Print stopped", body: "The session has been stopped and logged." });
    } catch (e) {
      toast({ kind: "critical", title: "Could not " + action, body: e instanceof ApiError ? e.message : "Network error" });
    } finally {
      setBusy(false);
    }
  };
  const running = status === "running" || status === "prechecking";
  const ended = status === "stopped" || status === "completed" || status === "aborted";
  const pct = totalLayers ? Math.min(100, Math.round((layer / totalLayers) * 100)) : 0;
  return (
    <div className="sticky bottom-0 z-30 flex flex-wrap items-center gap-4 border-t border-border bg-surface px-4 py-2 shadow-[0_-1px_3px_rgba(28,30,33,.08)] sm:px-6">
      <div className="min-w-[180px] flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-canvas">
            <div className="h-full bg-brand-600" style={{ width: `${pct}%` }} />
          </div>
          Layer {layer || "–"} of {totalLayers ?? "–"}
        </div>
      </div>
      {!canControl ? (
        <LockedButton reason="Only operators and engineers can control a print">Print controls</LockedButton>
      ) : status === "scheduled" ? (
        <Button className="h-14 min-w-[140px] text-base" onClick={() => act("start")} disabled={busy}>
          <Play aria-hidden className="h-5 w-5" /> Start print
        </Button>
      ) : (
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="h-14 min-w-[120px] text-base" onClick={() => act("pause")} disabled={busy || !running}>
            <Pause aria-hidden className="h-5 w-5" /> Pause
          </Button>
          <Button className="h-14 min-w-[120px] text-base" onClick={() => act("resume")} disabled={busy || status !== "paused"}>
            <Play aria-hidden className="h-5 w-5" /> Resume
          </Button>
          <HoldToStopButton onStop={() => act("stop")} disabled={busy || ended} />
        </div>
      )}
    </div>
  );
}
