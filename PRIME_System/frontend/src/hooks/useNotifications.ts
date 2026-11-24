import { useEffect } from "react";
import { create } from "zustand";
import { get } from "../api/client";
import type { NotificationOut, WsEnvelope } from "../api/types";
import { toast, type ToastKind } from "../components/Toaster";
import { socket } from "../ws/socket";

interface NoteStore { items: NotificationOut[]; unread: number; set: (items: NotificationOut[]) => void; add: (n: NotificationOut) => void }
export const useNotes = create<NoteStore>((set) => ({
  items: [], unread: 0,
  set: (items) => set({ items, unread: items.filter((n) => !n.read_at).length }),
  add: (n) => set((s) => ({ items: [n, ...s.items].slice(0, 50), unread: s.unread + 1 })),
}));

const KIND: Record<string, ToastKind> = { alert: "warning", escalation: "warning", recommendation: "ai", nudge: "ai", badge: "success", report_ready: "success" };

/** Loads notifications once and turns live ones (user channel) into nudges/toasts. */
export function useNotificationFeed(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    get<NotificationOut[]>("/me/notifications?limit=30").then((n) => useNotes.getState().set(n)).catch(() => undefined);
    return socket.on((m: WsEnvelope) => {
      if (m.type !== "notification") return;
      const d = m.data as { id: string; kind: string; title: string; body: string | null; link: string | null };
      useNotes.getState().add({ id: d.id, kind: d.kind, title: d.title, body: d.body, link: d.link, read_at: null, created_at: m.ts ?? new Date().toISOString() });
      const kind = d.title.startsWith("Critical") ? "critical" : d.title.startsWith("Change applied") ? "success" : KIND[d.kind] ?? "neutral";
      toast({ kind, title: d.title, body: d.body });
    });
  }, [enabled]);
}
