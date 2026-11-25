import { useQuery } from "@tanstack/react-query";
import { BellRing, Camera, Check, Eye, Hand, Lock, Megaphone, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, get, patch, post } from "../api/client";
import type { AlertOut, MeOut, PrinterLive, SensorTest } from "../api/types";
import { AlertBanner } from "../components/AlertBanner";
import { Button } from "../components/Button";
import { HoldToStopButton } from "../components/HoldToStopButton";
import { LogoMark } from "../components/Logo";
import { MetricTile } from "../components/MetricTile";
import { StatusPill } from "../components/StatusPill";
import { toast } from "../components/Toaster";
import { useAuth, useCan } from "../store/auth";

type Flags = Partial<Record<"welcome_done" | "role_seen" | "tour_done" | "practice_stop_done" | "first_live_watched" | "dismissed", boolean>>;

/** Saves onboarding flags and keeps /me in sync (the dashboard checklist reads the same flags). */
export async function saveOnboarding(flags: Flags) {
  const ob = await patch<Record<string, boolean>>("/me/onboarding", flags);
  const me = useAuth.getState().me;
  if (me) useAuth.getState().setMe({ ...me, onboarding: ob } as MeOut);
}

function Dots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${step} of 4`}>
      {[1, 2, 3, 4].map((i) => <span key={i} className={`h-2 rounded-full ${i === step ? "w-6 bg-brand-600" : i < step ? "w-2 bg-ok" : "w-2 bg-border"}`} />)}
    </div>
  );
}

function Frame({ step, children, side }: { step: number; children: ReactNode; side?: ReactNode }) {
  const nav = useNavigate();
  const skip = () => { saveOnboarding({ dismissed: true }).catch(() => undefined); nav("/dashboard", { replace: true }); };
  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="hidden w-[42%] flex-col justify-between bg-brand-700 p-10 text-surface lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold"><span className="rounded-ctl bg-surface p-1"><LogoMark className="h-7 w-7" /></span> PRIME</div>
        <div>{side ?? (
          <svg viewBox="0 0 320 200" className="w-full max-w-md" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={70 - i * 2} y={150 - i * 30} width={180 + i * 4} height={28} rx={14} fill="none" stroke="var(--surface)" strokeOpacity={0.35 + i * 0.1} strokeWidth={2} />)}
            <rect x={150} y={0} width={20} height={20} rx={4} fill="var(--surface)" fillOpacity={0.6} />
          </svg>
        )}</div>
        <p className="text-sm text-border">AI-Powered Concrete 3D Printing Platform</p>
      </div>
      <main className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-xl space-y-6">
          <div className="flex items-center justify-between"><Dots step={step} /><button type="button" onClick={skip} className="text-sm text-text-muted underline">Skip setup</button></div>
          {children}
        </div>
      </main>
    </div>
  );
}

export function WelcomePage() {
  const nav = useNavigate();
  const me = useAuth((s) => s.me);
  const go = () => { saveOnboarding({ welcome_done: true }).catch(() => undefined); nav("/onboarding/role"); };
  const points = [
    [Eye, "See every print condition live", "Temperature, pump, speed and layer geometry, updated every second."],
    [BellRing, "Get warned before defects form", "Clear alerts tell you what is wrong and where to look."],
    [Sparkles, "AI suggests, you decide", "The models propose changes with reasons. People approve them."],
  ] as const;
  return (
    <Frame step={1}>
      <h1 className="flex items-center gap-3 text-3xl font-semibold"><Hand aria-hidden className="h-8 w-8 text-brand-600" /> Welcome to PRIME, {me?.full_name.split(" ")[0]}</h1>
      <ul className="space-y-4">
        {points.map(([Icon, t, d]) => (
          <li key={t} className="flex gap-3"><Icon aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-brand-600" /><span><span className="block font-semibold">{t}</span><span className="text-sm text-text-muted">{d}</span></span></li>
        ))}
      </ul>
      <p className="text-sm text-text-muted">Setup takes under 3 minutes. You can skip it and come back from Settings.</p>
      <Button className="h-12 px-6 text-base" onClick={go}>Get started</Button>
    </Frame>
  );
}

const CAN: { perm: Parameters<typeof useCan>[0]; text: string }[] = [
  { perm: "view_live", text: "View live data, camera and graphs" },
  { perm: "control_session", text: "Pause, resume and stop prints" },
  { perm: "acknowledge_alert", text: "Acknowledge alerts" },
  { perm: "escalate", text: "Escalate to the on-duty engineer" },
  { perm: "decide_recommendation", text: "Accept, modify or reject AI suggestions" },
  { perm: "manual_adjust", text: "Change pump speed, print speed or delay" },
  { perm: "view_raw_data", text: "See raw sensor data" },
  { perm: "export_data", text: "Export session data and reports" },
  { perm: "manage_users", text: "Create users and assign roles" },
];

export function RolePage() {
  const nav = useNavigate();
  const me = useAuth((s) => s.me);
  const perms = new Set(me?.permissions ?? []);
  const role = { operator: "Operator", engineer: "Engineer", admin: "Administrator", manager: "Manager" }[me?.role ?? "operator"];
  const next = () => {
    saveOnboarding({ role_seen: true }).catch(() => undefined);
    nav(perms.has("control_session") ? "/onboarding/tour" : perms.has("manage_sessions") ? "/onboarding/printer" : "/dashboard");
  };
  return (
    <Frame step={2}>
      <h1 className="text-2xl font-semibold">Your administrator set you up as <span className="text-brand-700">{role}</span> at <span className="text-brand-700">{me?.sites.map((s) => s.name).join(", ")}</span>.</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-card bg-surface p-4 shadow-sm">
          <p className="mb-2 font-semibold">You can</p>
          <ul className="space-y-2 text-sm">{CAN.filter((c) => perms.has(c.perm)).map((c) => <li key={c.text} className="flex gap-2"><Check aria-hidden className="h-4 w-4 shrink-0 text-ok" />{c.text}</li>)}</ul>
        </div>
        <div className="rounded-card bg-surface p-4 shadow-sm">
          <p className="mb-2 font-semibold">Needs another role</p>
          <ul className="space-y-2 text-sm text-text-muted">{CAN.filter((c) => !perms.has(c.perm)).map((c) => <li key={c.text} className="flex gap-2"><Lock aria-hidden className="h-4 w-4 shrink-0" />{c.text}</li>)}</ul>
        </div>
      </div>
      <p className="text-sm text-text-muted">Buttons you can't use stay visible with a lock, so you always know who to ask.</p>
      <Button className="h-12 px-6 text-base" onClick={next}>Next</Button>
    </Frame>
  );
}

const PRACTICE_ALERT: AlertOut = {
  id: "practice", session_id: "practice", layer_no: 5, signal: "sll_width", kind: "out_of_range", severity: "warning",
  message: "Layer width 18.05 mm is below target (19.5 ± 1.0) and dropping. Check Vision.", value: 18.05, threshold: 18.5,
  status: "acknowledged", raised_at: new Date().toISOString(), acknowledged_by: null, acknowledged_at: null, resolved_at: null,
};
const TOUR = [
  { title: "Read a metric tile", text: "Each tile shows the live value, its normal range, the last minutes as a line, and a status label. Color is never the only signal." },
  { title: "Alerts tell you what to check", text: "When a value leaves its range, a banner explains it in plain words. Acknowledge it so the team knows you are on it." },
  { title: "Confirm with the camera", text: "The Vision tab draws the measured width and height over the bead, so you can confirm the problem is real." },
  { title: "Practice hold-to-stop", text: "Stopping needs a 1.5-second press, so it can't happen by accident. Try it now: this is a simulation and no printer stops." },
  { title: "Escalate when unsure", text: "Escalate sends the alert to the on-duty engineer and tells you how quickly they usually respond." },
];

/** Coach marks over a practice Live Monitor (docs/06 S05). The highlighted element sits above a dim backdrop. */
export function TourPage() {
  const nav = useNavigate();
  const canSetup = useCan("manage_sessions");
  const [step, setStep] = useState(0);
  const [practiced, setPracticed] = useState(!!useAuth.getState().me?.onboarding?.practice_stop_done);
  const finish = () => { saveOnboarding({ tour_done: true }).catch(() => undefined); nav(canSetup ? "/onboarding/printer" : "/dashboard", { replace: true }); };
  const practice = async () => {
    try {
      const r = await post<{ badge_earned: boolean }>("/me/onboarding/practice-stop");
      setPracticed(true);
      toast({ kind: "success", title: "Practice stop recorded", body: r.badge_earned ? "You earned the Safety First badge." : "Nothing was stopped; this was a simulation." });
    } catch (e) {
      toast({ kind: "critical", title: "Could not record the practice", body: e instanceof ApiError ? e.message : null });
    }
  };
  const spot = (i: number) => step === i ? "relative z-50 rounded-card ring-4 ring-brand-600 ring-offset-4 ring-offset-canvas" : "";
  const t = TOUR[step];
  return (
    <div className="min-h-screen bg-canvas">
      <div className="fixed inset-0 z-40 backdrop-strong" aria-hidden />
      <header className="flex h-16 items-center gap-4 border-b border-border bg-surface px-6">
        <span className="font-semibold">Practice print · Wall Panel WP-03 · Gantry-02</span>
        <nav className={`ml-6 flex gap-1 ${spot(2)}`}>{["Live", "Vision", "Trends", "AI"].map((x) => <span key={x} className={`rounded-ctl px-3 py-2 text-sm font-medium ${x === "Vision" && step === 2 ? "bg-brand-50 text-brand-700" : "text-text-muted"}`}>{x === "Vision" && <Camera aria-hidden className="mr-1 inline h-4 w-4" />}{x}</span>)}</nav>
      </header>
      <div className={spot(1)}><AlertBanner alert={PRACTICE_ALERT} /></div>
      <div className="grid max-w-5xl gap-4 p-6 sm:grid-cols-2">
        <div className={spot(0)}>
          <MetricTile label="Material temperature" value={21.6} unit="°C" level="ok" range="Normal 18.0–24.0 °C"
            points={Array.from({ length: 30 }, (_, i) => ({ t: i, v: 21.9 - i * 0.01 + Math.sin(i / 3) * 0.05 }))} band={[18, 24]} />
        </div>
        <MetricTile label="Layer width" value={18.05} unit="mm" digits={2} level="warning" levelLabel="Below target" range="Target 19.5 ± 1.0 mm" size="lg"
          points={Array.from({ length: 30 }, (_, i) => ({ t: i, v: 19.5 - i * 0.05 }))} band={[18.5, 20.5]} />
        <div className={`flex items-center ${spot(4)}`}><Button variant="secondary" className="h-14"><Megaphone aria-hidden className="h-4 w-4" /> Escalate to engineer</Button></div>
      </div>
      <div className={`fixed bottom-0 left-0 right-0 flex items-center justify-end gap-3 border-t border-border bg-surface px-6 py-3 ${step === 3 ? "z-50" : "z-30"}`}>
        <span className="mr-auto text-sm font-semibold">WP-03 · Layer 5 of 8</span>
        <Button variant="secondary" className="h-14" disabled>Pause</Button>
        <div className={spot(3)}><HoldToStopButton onStop={practice} /></div>
      </div>
      <div role="dialog" aria-live="polite" aria-label={`Tour step ${step + 1} of ${TOUR.length}`}
        className="fixed right-4 top-24 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-card bg-surface p-5 shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Step {step + 1} of {TOUR.length}</p>
        <h2 className="mt-1 text-lg font-semibold">{t.title}</h2>
        <p className="mt-1 text-sm text-text-muted">{t.text}</p>
        {step === 3 && <p className="mt-2 text-sm">{practiced ? <StatusPill level="ok" label="Practice done" /> : "Press and hold the red STOP button at the bottom right."}</p>}
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={finish} className="text-sm text-text-muted underline">Skip tour</button>
          <span className="flex-1" />
          {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
          {step < TOUR.length - 1 ? <Button onClick={() => setStep(step + 1)}>Next</Button> : <Button onClick={finish}>Finish</Button>}
        </div>
      </div>
    </div>
  );
}

const STEPS = ["Printer", "Sensors", "Camera calibration", "Test"];

export function PrinterSetupPage() {
  const nav = useNavigate();
  const canSetup = useCan("manage_sessions");
  const printers = useQuery({ queryKey: ["printers"], queryFn: () => get<PrinterLive[]>("/printers") });
  const [pid, setPid] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [calib, setCalib] = useState(0);
  const [test, setTest] = useState<SensorTest | null>(null);
  const [busy, setBusy] = useState(false);
  const printer = (printers.data ?? []).find((p) => p.id === pid) ?? printers.data?.[0];
  useEffect(() => {
    if (step !== 2 || calib >= 100) return;
    const t = setTimeout(() => setCalib((c) => Math.min(100, c + 10)), 250);
    return () => clearTimeout(t);
  }, [step, calib]);
  const runTest = async () => {
    if (!printer) return;
    setBusy(true);
    try {
      const r = await post<SensorTest>(`/printers/${printer.id}/sensors/test`);
      setTest(r);
      toast({ kind: r.passed ? "success" : "warning", title: r.passed ? "All sensors reporting" : "Some sensors did not report", body: r.passed ? "Calibrated badge progress updated." : "Check the cables and run the test again." });
    } catch (e) {
      toast({ kind: "critical", title: "Test failed to run", body: e instanceof ApiError ? e.message : null });
    } finally {
      setBusy(false);
    }
  };
  const done = () => { saveOnboarding({ tour_done: true }).catch(() => undefined); nav("/dashboard", { replace: true }); };
  if (!canSetup) return <Frame step={4}><p className="flex items-center gap-2"><Lock aria-hidden className="h-4 w-4" /> Printer setup is done by engineers and administrators.</p><Button onClick={done}>Go to dashboard</Button></Frame>;
  return (
    <Frame step={4} side={<ShieldCheck aria-hidden className="h-24 w-24 text-border" />}>
      <h1 className="text-2xl font-semibold">Connect a printer</h1>
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((s, i) => <li key={s} className={`rounded-full px-3 py-1 font-medium ${i === step ? "bg-brand-600 text-surface" : i < step ? "bg-ok-50 text-ok" : "bg-surface text-text-muted"}`}>{i < step && <Check aria-hidden className="mr-1 inline h-3.5 w-3.5" />}{i + 1}. {s}</li>)}
      </ol>
      <div className="rounded-card bg-surface p-4 shadow-sm">
        {step === 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-2 font-semibold">Which printer?</legend>
            {(printers.data ?? []).map((p) => (
              <label key={p.id} className={`flex cursor-pointer items-center justify-between rounded-ctl border p-3 text-sm ${printer?.id === p.id ? "border-brand-600 bg-brand-50" : "border-border"}`}>
                <span><input type="radio" name="printer" className="mr-2" checked={printer?.id === p.id} onChange={() => setPid(p.id)} /><strong>{p.name}</strong> · {p.bay} · {p.kind === "gantry" ? "Gantry" : "Robot arm"}</span>
                <span className="text-text-muted">nozzle {p.nozzle}</span>
              </label>
            ))}
          </fieldset>
        )}
        {step === 1 && printer && (
          <ul className="divide-y divide-border text-sm">
            {printer.sensors.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2"><span>{s.label} <span className="text-text-muted">({s.unit})</span></span>
                <StatusPill level={s.status === "live" ? "ok" : s.status === "calibrating" ? "info" : "critical"} label={s.status === "live" ? "Live" : s.status === "calibrating" ? "Calibrating" : "Offline"} /></li>
            ))}
          </ul>
        )}
        {step === 2 && (
          <div className="space-y-2 text-sm">
            <p className="font-semibold">Camera calibration</p>
            <p className="text-text-muted">Hold the 20 mm reference block under the camera. PRIME measures it to set the millimetre scale.</p>
            <div className="h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full bg-brand-600 transition-all" style={{ width: `${calib}%` }} /></div>
            <StatusPill level={calib >= 100 ? "ok" : "info"} label={calib >= 100 ? "Calibrated · 9.0 px/mm" : `Calibrating ${calib} %`} />
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3 text-sm">
            <p>The test replays 30 seconds of sensor data from this printer and checks every sensor.</p>
            <Button onClick={runTest} disabled={busy}>{busy ? "Testing…" : "Run 30-second test"}</Button>
            {test && (
              <ul className="divide-y divide-border">
                {test.sensors.map((s) => <li key={s.sensor_id} className="flex justify-between py-2"><span>{s.label}</span><span className="flex items-center gap-2"><span className="tabular text-text-muted">{s.last_value ?? "–"} {s.unit}</span><StatusPill level={s.status === "live" ? "ok" : "critical"} label={s.status === "live" ? "Live" : "No data"} /></span></li>)}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
        {step < 3 ? <Button onClick={() => setStep(step + 1)} disabled={step === 2 && calib < 100}>Next</Button> : <Button onClick={done} disabled={!test}>Finish setup</Button>}
      </div>
    </Frame>
  );
}
