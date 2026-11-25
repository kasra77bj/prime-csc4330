import { useEffect } from "react";
import { get } from "../api/client";
import type {
  Adjustment, AlertOut, Prediction, Quality, Reading, Recommendation, SessionDetail, SessionStatus, WsEnvelope,
} from "../api/types";
import { appendReading, SERIES_LEN, useLive, type Point } from "../store/live";
import { socket } from "../ws/socket";

interface Bucketed { points: Array<Record<string, number | null> & { t_s: number }> }

/** Loads a session's state over REST, then keeps it live over the WebSocket. */
export function useSessionStream(sessionId: string | undefined) {
  const patch = useLive((s) => s.patch);
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    const load = async () => {
      const [detail, alerts, recs, preds, adjs, hist, quality] = await Promise.all([
        get<SessionDetail>(`/sessions/${sessionId}`),
        get<AlertOut[]>(`/alerts?session_id=${sessionId}&limit=50`),
        get<Recommendation[]>(`/sessions/${sessionId}/recommendations`),
        get<Prediction[]>(`/sessions/${sessionId}/predictions?limit=200`),
        get<Adjustment[]>(`/sessions/${sessionId}/adjustments`),
        get<Bucketed>(`/sessions/${sessionId}/readings?signals=temperature,pump_rpm,motor_power,print_speed,sll_width,sll_height,flow&last_s=900&bucket=4s`),
        get<Quality>(`/sessions/${sessionId}/quality`).catch(() => null),
      ]);
      if (!alive) return;
      const series: Record<string, Point[]> = {};
      for (const k of ["temperature", "pump_rpm", "motor_power", "print_speed", "sll_width", "sll_height", "flow"]) {
        series[k] = hist.points.filter((p) => p[k] !== null).map((p) => ({ t: p.t_s, v: p[k] as number })).slice(-SERIES_LEN);
      }
      const latest = detail.latest
        ? ({ ...(detail.latest as unknown as Reading), sim_t_s: detail.sim_time_s }) : null;
      patch(sessionId, () => ({
        detail, status: detail.status, latest, lastAny: latest, series,
        alerts: Object.fromEntries(alerts.filter((a) => a.status !== "resolved").map((a) => [a.id, a])),
        recs: Object.fromEntries(recs.map((r) => [r.id, r])),
        preds: {
          extrusion_rate: preds.filter((p) => p.target === "extrusion_rate").slice(-40),
          interlayer_delay: preds.filter((p) => p.target === "interlayer_delay").slice(-40),
        },
        adjustments: adjs, quality, loaded: true,
      }));
    };
    load().catch(() => undefined);
    const unsub = socket.subscribe(`session:${sessionId}`);
    const off = socket.on((m: WsEnvelope) => {
      if (m.session_id !== sessionId && m.channel !== `session:${sessionId}`) return;
      if (m.channel !== `session:${sessionId}`) return;
      switch (m.type) {
        case "reading":
          patch(sessionId, (s) => appendReading(s, m.data as Reading));
          break;
        case "alert": {
          const a = m.data as AlertOut;
          patch(sessionId, (s) => {
            const alerts = { ...s.alerts };
            if (a.status === "resolved") delete alerts[a.id];
            else alerts[a.id] = { ...alerts[a.id], ...a };
            return { alerts };
          });
          break;
        }
        case "recommendation": {
          const r = m.data as Recommendation;
          patch(sessionId, (s) => ({ recs: { ...s.recs, [r.id]: r } }));
          break;
        }
        case "prediction": {
          const p = m.data as Prediction;
          patch(sessionId, (s) => ({
            preds: { ...s.preds, [p.target]: [...s.preds[p.target], p].slice(-40) },
          }));
          break;
        }
        case "adjustment": {
          const a = m.data as Adjustment;
          patch(sessionId, (s) => {
            const i = s.adjustments.findIndex((x) => x.id === a.id);
            const list = [...s.adjustments];
            if (i >= 0) list[i] = { ...list[i], ...a };
            else list.push(a);
            return { adjustments: list };
          });
          break;
        }
        case "control": {
          const c = m.data as { status: SessionStatus; auto?: boolean; reason?: string | null };
          const auto = c.status === "paused" && !!c.auto;
          patch(sessionId, (s) => ({
            status: c.status,
            detail: s.detail ? { ...s.detail, status: c.status, auto_paused: auto, pause_reason: c.status === "paused" ? c.reason ?? null : null } : s.detail,
          }));
          break;
        }
        case "quality":
          patch(sessionId, () => ({ quality: m.data as Quality }));
          break;
        case "checkpoint":
        case "layer_completed":
          patch(sessionId, (s) => ({ tick: s.tick + 1 }));
          break;
        case "resync_required":
          load().catch(() => undefined);
          break;
      }
    });
    return () => {
      alive = false;
      off();
      unsub();
    };
  }, [sessionId, patch]);
}
