import { Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const HOLD_MS = 1500;

/** STOP requires a 1.5 s press-and-hold (mouse, touch or keyboard Space/Enter) to prevent accidental stops. */
export function HoldToStopButton({ onStop, disabled }: { onStop: () => void; disabled?: boolean }) {
  const [progress, setProgress] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  const stopHold = () => {
    start.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    setProgress(0);
  };
  const beginHold = () => {
    if (disabled || start.current !== null) return;
    start.current = performance.now();
    const step = () => {
      if (start.current === null) return;
      const p = Math.min(1, (performance.now() - start.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        stopHold();
        onStop();
      } else raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  useEffect(() => () => stopHold(), []);

  const r = 14, c = 2 * Math.PI * r;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Hold to stop the print"
      onPointerDown={beginHold}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); beginHold(); } }}
      onKeyUp={stopHold}
      className="relative inline-flex h-16 min-w-[168px] select-none items-center justify-center gap-2 rounded-ctl bg-critical px-5 text-base font-semibold text-white shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-critical focus-visible:ring-offset-2 disabled:opacity-50"
    >
      <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="3" />
        <circle cx="18" cy="18" r={r} fill="none" stroke="#fff" strokeWidth="3" strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)} strokeLinecap="round" />
      </svg>
      <span className="flex flex-col items-start leading-tight">
        <span className="flex items-center gap-1"><Square aria-hidden className="h-4 w-4 fill-white" /> STOP</span>
        <span className="text-[11px] font-medium text-white/80">{progress > 0 ? "Keep holding…" : "Hold to stop"}</span>
      </span>
    </button>
  );
}
