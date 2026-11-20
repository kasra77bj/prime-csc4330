import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, OctagonAlert, Sparkles, TriangleAlert } from "lucide-react";
import { apiGet } from "../api/client";

type Health = { status: string; db: boolean; demo_mode: boolean };

const swatches: [string, string][] = [
  ["canvas", "bg-canvas"], ["surface", "bg-surface"], ["border", "bg-border"], ["text", "bg-text"],
  ["text-muted", "bg-text-muted"], ["charcoal", "bg-charcoal"], ["brand-600", "bg-brand-600"],
  ["brand-700", "bg-brand-700"], ["brand-50", "bg-brand-50"], ["critical", "bg-critical"],
  ["ok", "bg-ok"], ["viz-teal", "bg-viz-teal"], ["viz-violet", "bg-viz-violet"], ["viz-ochre", "bg-viz-ochre"],
];

/** Phase-0 page: proves the stack is wired (tokens, fonts, icons, API, DB). Replaced by the app shell in T2.4. */
export default function FoundationPage() {
  const health = useQuery({ queryKey: ["health"], queryFn: () => apiGet<Health>("/health"), refetchInterval: 5000 });
  const ok = health.data?.status === "ok" && health.data.db;
  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <header className="flex items-center justify-between rounded-card bg-charcoal px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <Activity aria-hidden className="h-6 w-6" />
          <div>
            <h1 className="text-xl font-semibold">PRIME</h1>
            <p className="text-sm text-white/70">Process Real-time Intelligence for Manufacturing Excellence</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${ok ? "bg-ok-50 text-ok" : "bg-critical-50 text-critical"}`}>
          {ok ? <CheckCircle2 aria-hidden className="h-4 w-4" /> : <OctagonAlert aria-hidden className="h-4 w-4" />}
          {health.isLoading ? "Checking API…" : ok ? "API and database live" : "API not reachable"}
        </span>
      </header>

      <section className="rounded-card bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Design tokens</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {swatches.map(([name, cls]) => (
            <div key={name} className="text-xs">
              <div className={`h-12 rounded-ctl border border-border ${cls}`} />
              <p className="mt-1 font-mono text-text-muted">{name}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-card bg-surface p-4 shadow-sm">
          <p className="text-sm text-text-muted">Layer width</p>
          <p className="tabular text-3xl font-semibold">19.4 <span className="text-base text-text-muted">mm</span></p>
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-ok-50 px-2 py-0.5 text-xs text-ok">
            <CheckCircle2 aria-hidden className="h-3 w-3" /> In range
          </span>
        </div>
        <div className="rounded-card border-l-4 border-viz-ochre bg-surface p-4 shadow-sm">
          <p className="text-sm text-text-muted">Layer width</p>
          <p className="tabular text-3xl font-semibold">18.1 <span className="text-base text-text-muted">mm</span></p>
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-warn-50 px-2 py-0.5 text-xs text-text">
            <TriangleAlert aria-hidden className="h-3 w-3 text-viz-ochre" /> Warning
          </span>
        </div>
        <div className="rounded-card border-l-4 border-brand-600 bg-brand-50 p-4 shadow-sm">
          <p className="flex items-center gap-1 text-sm text-brand-700"><Sparkles aria-hidden className="h-4 w-4" /> AI</p>
          <p className="font-semibold">Increase pump speed 27 → 34 RPM</p>
          <p className="text-xs text-text-muted">Extrusion model (XGBoost)</p>
        </div>
      </section>
    </main>
  );
}
