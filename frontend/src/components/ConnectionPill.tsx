import { Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useConnection } from "../ws/socket";

/** Live · Reconnecting (N s, data buffered) · Offline (reliability NFR). */
export function ConnectionPill({ dark = false }: { dark?: boolean }) {
  const { state, missedSince } = useConnection();
  const [, tick] = useState(0);
  useEffect(() => {
    if (state !== "reconnecting") return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [state]);
  const base = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium";
  if (state === "live")
    return (
      <span className={`${base} ${dark ? "bg-white/10 text-white" : "bg-ok-50 text-ok"}`}>
        <span className={`h-2 w-2 rounded-full ${dark ? "bg-[#8BD39A]" : "bg-ok"}`} aria-hidden /> Live
      </span>
    );
  if (state === "reconnecting" || state === "connecting") {
    const secs = missedSince ? Math.round((Date.now() - missedSince) / 1000) : 0;
    return (
      <span className={`${base} bg-warn-50 text-text`}>
        <Wifi aria-hidden className="h-3.5 w-3.5 text-viz-ochre" />
        {state === "connecting" ? "Connecting…" : `Reconnecting… ${secs}s · readings are buffered`}
      </span>
    );
  }
  return (
    <span className={`${base} bg-critical-50 text-critical`}>
      <WifiOff aria-hidden className="h-3.5 w-3.5" /> Offline
    </span>
  );
}
