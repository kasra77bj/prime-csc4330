import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, ScanLine } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiError, get, post } from "../api/client";
import type { FrameOut, LayerRow } from "../api/types";
import { Button } from "../components/Button";
import { LockedButton } from "../components/LockedButton";
import { Sparkline } from "../components/Sparkline";
import { StatusPill, type Level } from "../components/StatusPill";
import { toast } from "../components/Toaster";
import { PrintLayout } from "../layouts/PrintLayout";
import { fmt } from "../lib/format";
import { useCan } from "../store/auth";
import { useSession } from "../store/live";

const PX_PER_MM = 9;          // camera scale: 19.5 mm bead ≈ 175 px in a 720×480 frame
const W = 720, H = 480, CX = 360, TOP = 110;

export function deviation(measured: number, target: number, tol: number): { pct: number; level: Level } {
  const d = measured - target;
  return { pct: (d / target) * 100, level: Math.abs(d) <= tol ? "ok" : Math.abs(d) <= 2 * tol ? "warning" : "critical" };
}

/** Deterministic texture dots so the bead looks like concrete, not a flat shape. */
function dots(seed: number, x: number, y: number, w: number, h: number) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: 22 }, (_, i) => (
    <circle key={i} cx={x + 8 + rnd() * (w - 16)} cy={y + 6 + rnd() * (h - 12)} r={0.8 + rnd() * 1.4} fill="var(--text-muted)" fillOpacity={0.25 + rnd() * 0.3} />
  ));
}

/** Profile camera frame: the beads below the nozzle drawn from measured geometry, overlay in surface/brand only. */
function CameraFrame({ frame, below, overlay }: { frame: FrameOut; below: number[]; overlay: boolean }) {
  const bw = frame.width_mm * PX_PER_MM, bh = frame.height_mm * PX_PER_MM;
  const x = CX - bw / 2;
  const stack = below.map((w, i) => ({ w: w * PX_PER_MM, y: TOP + bh * (i + 1) }));
  const edge = `M${x},${TOP + bh / 2} C${x},${TOP - 4} ${x + bw},${TOP - 4} ${x + bw},${TOP + bh / 2} C${x + bw},${TOP + bh + 4} ${x},${TOP + bh + 4} ${x},${TOP + bh / 2}`;
  const capY = TOP + bh / 2, hx = x + bw + 34;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-card" role="img"
      aria-label={`Camera view of layer ${frame.layer}: width ${fmt(frame.width_mm, 2)} millimetres, height ${fmt(frame.height_mm, 2)} millimetres`}>
      <rect width={W} height={H} fill="var(--charcoal)" />
      <ellipse cx={CX} cy={H + 40} rx={420} ry={190} fill="var(--text-muted)" fillOpacity={0.3} />
      {stack.map((b, i) => (
        <g key={i}>
          <rect x={CX - b.w / 2} y={b.y} width={b.w} height={bh} rx={bh * 0.42} fill="var(--border)" stroke="var(--text-muted)" strokeWidth={1.5} />
          {dots(i + 7, CX - b.w / 2, b.y, b.w, bh)}
        </g>
      ))}
      <rect x={x} y={TOP} width={bw} height={bh} rx={bh * 0.42} fill="var(--border)" stroke="var(--text-muted)" strokeWidth={1.5} />
      {dots(frame.layer, x, TOP, bw, bh)}
      <rect x={CX - 26} y={0} width={52} height={TOP - 8} rx={6} fill="var(--text-muted)" />
      <text x={16} y={26} fontSize={13} fill="var(--surface)" fillOpacity={0.8}>Profile camera · layer {frame.layer} · checkpoint {frame.checkpoint} of 4</text>
      {overlay && (
        <g>
          <rect x={x - 24} y={TOP - 22} width={bw + 48} height={bh + 44} fill="none" stroke="var(--surface)" strokeOpacity={0.55} strokeDasharray="6 5" />
          <path d={edge} fill="none" stroke="var(--brand-600)" strokeWidth={2.5} />
          <line x1={x} x2={x + bw} y1={capY} y2={capY} stroke="var(--surface)" strokeWidth={2} />
          <line x1={x} x2={x} y1={capY - 12} y2={capY + 12} stroke="var(--surface)" strokeWidth={2} />
          <line x1={x + bw} x2={x + bw} y1={capY - 12} y2={capY + 12} stroke="var(--surface)" strokeWidth={2} />
          <rect x={CX - 52} y={capY - 40} width={104} height={24} rx={4} fill="var(--brand-700)" />
          <text x={CX} y={capY - 23} fontSize={14} fontWeight={600} textAnchor="middle" fill="var(--surface)">{fmt(frame.width_mm, 2)} mm</text>
          <line x1={hx} x2={hx} y1={TOP} y2={TOP + bh} stroke="var(--surface)" strokeWidth={2} />
          <line x1={hx - 10} x2={hx + 10} y1={TOP} y2={TOP} stroke="var(--surface)" strokeWidth={2} />
          <line x1={hx - 10} x2={hx + 10} y1={TOP + bh} y2={TOP + bh} stroke="var(--surface)" strokeWidth={2} />
          <rect x={hx + 14} y={capY - 12} width={96} height={24} rx={4} fill="var(--brand-700)" />
          <text x={hx + 62} y={capY + 5} fontSize={14} fontWeight={600} textAnchor="middle" fill="var(--surface)">{fmt(frame.height_mm, 2)} mm</text>
        </g>
      )}
    </svg>
  );
}

export function VisionPage() {
  const { sessionId } = useParams();
  const s = useSession(sessionId);
  const qc = useQueryClient();
  const canFlag = useCan("flag_frame");
  const [overlay, setOverlay] = useState(true);
  const [picked, setPicked] = useState<number | null>(null);
  const layers = useQuery({ queryKey: ["layers", sessionId, s.tick], queryFn: () => get<LayerRow[]>(`/sessions/${sessionId}/layers`), enabled: !!sessionId, placeholderData: (p) => p });
  const withCp = (layers.data ?? []).filter((l) => l.checkpoints.length > 0);
  const latest = withCp[withCp.length - 1]?.layer ?? null;
  const layerNo = picked ?? latest;
  useEffect(() => { if (picked !== null && latest !== null && picked > latest) setPicked(null); }, [picked, latest]);
  const frame = useQuery({
    queryKey: ["frame", sessionId, layerNo, s.tick], enabled: layerNo !== null, placeholderData: (p) => p,
    queryFn: () => get<FrameOut>(`/sessions/${sessionId}/layers/${layerNo}/frame`),
  });
  const job = s.detail?.job;
  const f = frame.data;
  const below = withCp.filter((l) => l.layer < (layerNo ?? 0)).reverse().slice(0, 3).map((l) => l.measured_width_mm ?? l.checkpoints[l.checkpoints.length - 1].sll_width_mm);
  const history = withCp.slice(-10).map((l) => ({ t: l.layer, v: l.measured_width_mm ?? l.checkpoints[l.checkpoints.length - 1].sll_width_mm }));
  const flag = async () => {
    if (!f) return;
    try {
      await post(`/checkpoints/${f.checkpoint_id}/flag-artifact`);
      toast({ kind: "neutral", title: "Frame flagged as an artifact", body: "Logged. Engineers will see it before trusting this measurement." });
      qc.invalidateQueries({ queryKey: ["frame", sessionId] });
    } catch (e) {
      toast({ kind: "critical", title: "Could not flag the frame", body: e instanceof ApiError ? e.message : null });
    }
  };
  const rows = f && job ? [
    { label: "Width", m: f.width_mm, t: job.target_layer_width_mm, tol: job.width_tolerance_mm },
    { label: "Height", m: f.height_mm, t: job.target_layer_height_mm, tol: job.height_tolerance_mm },
  ] : [];
  return (
    <PrintLayout>
      <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[1fr_320px]">
        <section className="space-y-3" aria-label="Camera">
          {f ? <CameraFrame frame={f} below={below} overlay={overlay} /> : (
            <div className="flex aspect-[3/2] flex-col items-center justify-center gap-2 rounded-card bg-charcoal text-sm text-border">
              <ScanLine aria-hidden className="h-8 w-8" />
              {layers.isLoading ? "Loading camera…" : "The camera measures the first checkpoint about 24 s after the print starts."}
            </div>
          )}
          {withCp.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-text-muted">Layer</span>
              {withCp.map((l) => (
                <button key={l.layer} type="button" onClick={() => setPicked(l.layer === latest ? null : l.layer)}
                  aria-pressed={l.layer === layerNo}
                  className={`min-w-[44px] rounded-ctl border px-3 py-2 font-medium ${l.layer === layerNo ? "border-brand-600 bg-brand-50 text-brand-700" : "border-border bg-surface text-text-muted hover:text-text"}`}>
                  {l.layer}{l.layer === latest ? " · live" : ""}
                </button>
              ))}
            </div>
          )}
        </section>
        <aside className="space-y-4" aria-label="Measurements">
          <div className="rounded-card bg-surface p-4 shadow-sm">
            <p className="mb-2 text-sm font-semibold">Measured vs target</p>
            {rows.length === 0 ? <p className="text-sm text-text-muted">No measurement yet.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-text-muted"><th className="pb-1 font-medium" /><th className="pb-1 font-medium">Measured</th><th className="pb-1 font-medium">Target</th><th className="pb-1 font-medium">Status</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const d = deviation(r.m, r.t, r.tol);
                    return (
                      <tr key={r.label} className="border-t border-border">
                        <td className="py-2 font-medium">{r.label}</td>
                        <td className="tabular py-2">{fmt(r.m, 2)} mm</td>
                        <td className="tabular py-2 text-text-muted">{r.t} ± {r.tol}</td>
                        <td className="py-2"><StatusPill level={d.level} label={`${d.pct > 0 ? "+" : ""}${fmt(d.pct, 1)} %`} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="rounded-card bg-surface p-4 shadow-sm">
            <p className="text-sm font-semibold">Layer width, last {history.length} layers</p>
            <div className="mt-2"><Sparkline points={history} height={56} band={job ? [job.target_layer_width_mm - job.width_tolerance_mm, job.target_layer_width_mm + job.width_tolerance_mm] : undefined} /></div>
            <p className="mt-1 text-xs text-text-muted">Shaded band = target ± tolerance</p>
          </div>
          <div className="space-y-3 rounded-card bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm">
              <span>Measurement confidence</span>
              <span className="tabular font-semibold">{f ? `${Math.round(f.measurement_confidence * 100)} %` : "–"}</span>
            </div>
            <label className="flex cursor-pointer items-center justify-between text-sm">
              Show overlay
              <input type="checkbox" className="h-5 w-5 accent-[var(--brand-600)]" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />
            </label>
            {f?.flagged_artifact ? (
              <StatusPill level="info" label="Flagged as artifact" />
            ) : canFlag ? (
              <Button variant="secondary" className="w-full" onClick={flag} disabled={!f}><Flag aria-hidden className="h-4 w-4" /> Flag as artifact</Button>
            ) : (
              <LockedButton reason="Only operators and engineers can flag frames">Flag as artifact</LockedButton>
            )}
            <p className="text-xs text-text-muted">Flag a frame when the camera saw something that is not the real bead (dust, a shadow, a tool). The measurement stays in the record, marked as doubtful.</p>
          </div>
        </aside>
      </div>
    </PrintLayout>
  );
}
