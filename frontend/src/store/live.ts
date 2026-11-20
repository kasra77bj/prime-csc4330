import { create } from "zustand";
import type {
  Adjustment, AlertOut, Prediction, Reading, Recommendation, SessionDetail, SessionStatus, SignalKey,
} from "../api/types";

export interface Point { t: number; v: number }
export const SERIES_LEN = 240;

export interface LiveSession {
  detail: SessionDetail | null;
  status: SessionStatus | null;
  latest: Reading | null;        // latest printing reading (tiles)
  lastAny: Reading | null;       // latest reading of any phase (delay countdown)
  series: Partial<Record<SignalKey, Point[]>>;
  alerts: Record<string, AlertOut>;
  recs: Record<string, Recommendation>;
  preds: { extrusion_rate: Prediction[]; interlayer_delay: Prediction[] };
  adjustments: Adjustment[];
  loaded: boolean;
}

const empty = (): LiveSession => ({
  detail: null, status: null, latest: null, lastAny: null, series: {}, alerts: {}, recs: {},
  preds: { extrusion_rate: [], interlayer_delay: [] }, adjustments: [], loaded: false,
});

interface LiveStore {
  sessions: Record<string, LiveSession>;
  patch: (id: string, fn: (s: LiveSession) => Partial<LiveSession>) => void;
  reset: (id: string) => void;
}

export const useLive = create<LiveStore>((set) => ({
  sessions: {},
  patch: (id, fn) => set((st) => {
    const cur = st.sessions[id] ?? empty();
    return { sessions: { ...st.sessions, [id]: { ...cur, ...fn(cur) } } };
  }),
  reset: (id) => set((st) => ({ sessions: { ...st.sessions, [id]: empty() } })),
}));

export const useSession = (id: string | undefined): LiveSession =>
  useLive((s) => (id ? s.sessions[id] : undefined) ?? EMPTY);
const EMPTY = empty();

export function appendReading(s: LiveSession, r: Reading): Partial<LiveSession> {
  const out: Partial<LiveSession> = { lastAny: r };
  if (r.phase === "printing") {
    out.latest = r;
    const series = { ...s.series };
    for (const k of ["temperature", "pump_rpm", "motor_power", "print_speed", "sll_width", "sll_height", "flow"] as const) {
      const v = r[k];
      if (v === null || v === undefined) continue;
      const arr = series[k] ? [...series[k]!] : [];
      arr.push({ t: r.sim_t_s, v });
      if (arr.length > SERIES_LEN) arr.splice(0, arr.length - SERIES_LEN);
      series[k] = arr;
    }
    out.series = series;
  }
  return out;
}
