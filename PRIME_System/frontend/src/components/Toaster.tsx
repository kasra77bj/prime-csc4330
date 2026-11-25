import { CheckCircle2, Info, OctagonAlert, Sparkles, TriangleAlert, X } from "lucide-react";
import { useEffect } from "react";
import { create } from "zustand";

export type ToastKind = "neutral" | "success" | "warning" | "critical" | "ai";
export interface Toast { id: number; kind: ToastKind; title: string; body?: string | null; actions?: { label: string; onClick: () => void }[] }

const useToasts = create<{ items: Toast[]; push: (t: Omit<Toast, "id">) => void; drop: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => set((s) => ({ items: [...s.items.slice(-1), { ...t, id: Date.now() + Math.random() }] })),
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

export const toast = (t: Omit<Toast, "id">) => useToasts.getState().push(t);

const STYLE: Record<ToastKind, { cls: string; icon: typeof Info; iconCls: string }> = {
  neutral: { cls: "bg-charcoal text-white", icon: Info, iconCls: "" },
  success: { cls: "bg-ok-50 text-text border border-ok/30", icon: CheckCircle2, iconCls: "text-ok" },
  warning: { cls: "bg-warn-50 text-text border border-viz-ochre/40", icon: TriangleAlert, iconCls: "text-viz-ochre" },
  critical: { cls: "bg-critical-50 text-text border border-critical/40", icon: OctagonAlert, iconCls: "text-critical" },
  ai: { cls: "bg-charcoal text-white", icon: Sparkles, iconCls: "text-[#C9B3E6]" },
};

function ToastItem({ t }: { t: Toast }) {
  const drop = useToasts((s) => s.drop);
  useEffect(() => {
    const h = setTimeout(() => drop(t.id), 8000);
    return () => clearTimeout(h);
  }, [t.id, drop]);
  const s = STYLE[t.kind];
  const Icon = s.icon;
  return (
    <div role="status" className={`pointer-events-auto flex w-[360px] max-w-[calc(100vw-2rem)] gap-3 rounded-card p-3 shadow-lg ${s.cls}`}>
      <Icon aria-hidden className={`mt-0.5 h-5 w-5 shrink-0 ${s.iconCls}`} />
      <div className="flex-1 text-sm">
        <p className="font-semibold">{t.title}</p>
        {t.body && <p className="mt-0.5 opacity-90">{t.body}</p>}
        {t.actions && (
          <div className="mt-2 flex gap-2">
            {t.actions.map((a) => (
              <button key={a.label} type="button" onClick={() => { a.onClick(); drop(t.id); }}
                className="rounded-ctl border border-current px-2 py-1 text-xs font-semibold hover:opacity-80">{a.label}</button>
            ))}
          </div>
        )}
      </div>
      <button type="button" aria-label="Dismiss" onClick={() => drop(t.id)} className="opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Max one nudge visible at a time on small screens, up to 3 on desktop; sits above the control bar. */
export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-50 flex flex-col gap-2">
      {items.map((t) => <ToastItem key={t.id} t={t} />)}
    </div>
  );
}
