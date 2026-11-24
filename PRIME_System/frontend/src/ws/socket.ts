import { create } from "zustand";
import type { WsEnvelope } from "../api/types";

export type ConnState = "connecting" | "live" | "reconnecting" | "offline";

interface ConnStore {
  state: ConnState;
  missedSince: number | null;   // when the connection dropped (ms)
  recovered: number | null;     // events recovered after the last reconnect
  set: (p: Partial<ConnStore>) => void;
}
export const useConnection = create<ConnStore>((set) => ({
  state: "offline", missedSince: null, recovered: null, set: (p) => set(p),
}));

type Listener = (msg: WsEnvelope) => void;

/** One WebSocket for the whole app. Remembers the last seq per channel and resumes from it after a drop
 *  (the server replays what was missed: reliability NFR). */
class LiveSocket {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private channels = new Map<string, number | null>();   // channel -> last seq
  private listeners = new Set<Listener>();
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private manualClose = false;

  connect(token: string) {
    if (this.token === token && this.ws && this.ws.readyState <= 1) return;
    this.token = token;
    this.manualClose = false;
    this.open();
  }

  disconnect() {
    this.manualClose = true;
    this.ws?.close();
    this.ws = null;
    this.channels.clear();
    useConnection.getState().set({ state: "offline" });
  }

  subscribe(channel: string) {
    if (!this.channels.has(channel)) this.channels.set(channel, null);
    this.send({ type: "subscribe", channel, last_seq: this.channels.get(channel) ?? undefined });
    return () => {
      this.channels.delete(channel);
      this.send({ type: "unsubscribe", channel });
    };
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private send(m: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private open() {
    if (!this.token) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const base = import.meta.env.VITE_WS_BASE ?? `${proto}://${location.host}`;
    const ws = new WebSocket(`${base}/ws?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;
    const conn = useConnection.getState();
    conn.set({ state: this.retry ? "reconnecting" : "connecting" });
    ws.onopen = () => {
      this.retry = 0;
      for (const [ch, seq] of this.channels) ws.send(JSON.stringify({ type: "subscribe", channel: ch, last_seq: seq ?? undefined }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data as string) as WsEnvelope<{ state?: string; recovered?: number }>;
      if (msg.channel && typeof msg.seq === "number") {
        const prev = this.channels.get(msg.channel);
        if (prev !== undefined && (prev === null || msg.seq > prev)) this.channels.set(msg.channel, msg.seq);
      }
      if (msg.type === "connection" && msg.channel?.startsWith("session:")) {
        const recovered = msg.data.recovered ?? 0;
        useConnection.getState().set({
          state: msg.data.state === "live" ? "live" : "reconnecting",
          recovered: useConnection.getState().missedSince ? recovered : null,
          missedSince: msg.data.state === "live" ? null : useConnection.getState().missedSince,
        });
      } else if (msg.type === "connection" && useConnection.getState().state !== "reconnecting") {
        useConnection.getState().set({ state: "live" });
      }
      this.listeners.forEach((fn) => fn(msg));
    };
    ws.onclose = () => {
      if (this.manualClose) return;
      const c = useConnection.getState();
      c.set({ state: "reconnecting", missedSince: c.missedSince ?? Date.now() });
      const delay = Math.min(5000, 800 * 2 ** this.retry++);
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.open(), delay);
    };
  }
}

export const socket = new LiveSocket();
