import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crosshair, Layers, Lock, RotateCcw, ShieldCheck, Sparkles, Sunrise, Target, Trophy, WifiOff, Zap, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, get, post } from "../api/client";
import type { Achievements, SessionSummary } from "../api/types";
import { Button } from "../components/Button";
import { StatusPill } from "../components/StatusPill";
import { toast } from "../components/Toaster";
import { AppShell } from "../layouts/AppShell";
import { NUDGE_TYPES, mutedNudges, setMuted, type NudgeType } from "../lib/prefs";
import { useAuth, useCan } from "../store/auth";
import { saveOnboarding } from "./OnboardingPages";

const ICONS: Record<string, LucideIcon> = { zap: Zap, sunrise: Sunrise, layers: Layers, sparkles: Sparkles, crosshair: Crosshair, "shield-check": ShieldCheck };

export function AchievementsPage() {
  const q = useQuery({ queryKey: ["achievements"], queryFn: () => get<Achievements>("/me/achievements"), refetchInterval: 15000 });
  const a = q.data;
  const g = a?.goal;
  return (
    <AppShell title="Achievements" subtitle="Rewards attention and quality, never speed. Team goals, no individual leaderboards.">
      <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[1fr_360px]">
        <section aria-label="Badges">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Badges · {a ? `${a.earned} of ${a.badges.length} earned` : "…"}</h2>
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {(a?.badges ?? []).map((b) => {
              const Icon = ICONS[b.icon] ?? Trophy;
              const earned = !!b.earned_at;
              return (
                <div key={b.code} className={`flex gap-4 rounded-card bg-surface p-4 shadow-sm ${earned ? "" : "opacity-80"}`}>
                  <span className={`relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full ${earned ? "bg-brand-600 text-surface" : "bg-canvas text-text-muted"}`}>
                    <Icon aria-hidden className="h-8 w-8" />
                    {!earned && <Lock aria-hidden className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-surface p-0.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{b.name}</p>
                    <p className="text-sm text-text-muted">{b.description}</p>
                    {earned ? <p className="mt-1"><StatusPill level="ok" label={`Earned ${new Date(b.earned_at!).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" })}`} /></p> : (
                      <div className="mt-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full bg-brand-600" style={{ width: `${Math.round((b.progress / b.threshold) * 100)}%` }} /></div>
                        <p className="tabular mt-1 text-xs text-text-muted">{b.progress}/{b.threshold}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <aside className="space-y-4" aria-label="Shift">
          <div className="rounded-card bg-surface p-4 shadow-sm">
            <p className="flex items-center gap-2 font-semibold"><Layers aria-hidden className="h-5 w-5 text-brand-600" /> {a?.streak ?? 0}-layer clean streak</p>
            <p className="text-sm text-text-muted">Consecutive layers within tolerance on prints you operated.</p>
          </div>
          {g && (
            <div className="rounded-card bg-surface p-4 shadow-sm">
              <p className="flex items-center gap-2 font-semibold"><Target aria-hidden className="h-5 w-5 text-ok" /> {g.shift_label} goal</p>
              <p className="text-sm">{g.goal_text}</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full bg-ok" style={{ width: `${Math.round((g.progress / g.target) * 100)}%` }} /></div>
              <p className="tabular mt-1 text-xs text-text-muted">{g.progress} of {g.target} · a team goal for everyone on shift</p>
            </div>
          )}
          <div className="rounded-card bg-surface p-4 shadow-sm">
            <p className="mb-2 font-semibold">Your shift in numbers</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-text-muted">Layers monitored</dt><dd className="tabular text-xl font-semibold">{a?.shift.layers_monitored ?? "–"}</dd></div>
              <div><dt className="text-xs text-text-muted">Alerts handled</dt><dd className="tabular text-xl font-semibold">{a?.shift.alerts_handled ?? "–"}</dd>{a?.shift.avg_response_s != null && <dd className="text-xs text-text-muted">avg response {Math.round(a.shift.avg_response_s)} s</dd>}</div>
              <div><dt className="text-xs text-text-muted">Defects prevented</dt><dd className="tabular text-xl font-semibold">{a?.shift.defects_prevented ?? "–"}</dd><dd className="text-xs text-text-muted">warnings fixed before critical</dd></div>
              <div><dt className="text-xs text-text-muted">New badges</dt><dd className="text-sm font-semibold">{a?.shift.badges_earned.length ? a.shift.badges_earned.join(", ") : "None yet today"}</dd></div>
            </dl>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

/** Hidden demo control panel (docs/12 §9): Admin + DEMO_MODE only, not in the navigation. */
export function DemoPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const allowed = useCan("demo_controls");
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => get<SessionSummary[]>("/sessions"), refetchInterval: 3000, enabled: allowed });
  const [speed, setSpeed] = useState<Record<string, number>>({});
  const [layer, setLayer] = useState<Record<string, number>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const call = async (path: string, body: unknown, ok: string) => {
    try {
      await post(path, body);
      toast({ kind: "success", title: ok });
      qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch (e) {
      toast({ kind: "critical", title: "Demo control failed", body: e instanceof ApiError ? e.message : null });
    }
  };
  const reset = async () => {
    setConfirmReset(false);
    await call("/demo/reset", {}, "Demo data restored");
    useAuth.getState().signOut();
    nav("/login");
  };
  if (!allowed) return <AppShell title="Demo controls"><p className="m-6 flex items-center gap-2 text-sm"><Lock aria-hidden className="h-4 w-4" /> Demo controls are for administrators while demo mode is on.</p></AppShell>;
  const rows = (sessions.data ?? []).filter((s) => ["running", "paused", "prechecking", "scheduled"].includes(s.status));
  return (
    <AppShell title="Demo controls" subtitle="Rehearsal and fallback tools. Every action is logged in the audit trail.">
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3 rounded-card bg-surface p-4 shadow-sm">
          <RotateCcw aria-hidden className="h-5 w-5 text-brand-600" />
          <div className="flex-1"><p className="font-semibold">Reset demo data</p><p className="text-sm text-text-muted">Stops every print and restores the seeded state (about 5 s). Everyone has to sign in again.</p></div>
          {confirmReset ? <><Button variant="danger" onClick={reset}>Yes, reset everything</Button><Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button></> : <Button variant="secondary" onClick={() => setConfirmReset(true)}>Reset demo</Button>}
        </div>
        {rows.length === 0 && <p className="text-sm text-text-muted">No active or scheduled prints.</p>}
        {rows.map((s) => {
          const live = s.status !== "scheduled";
          return (
            <div key={s.id} className="space-y-3 rounded-card bg-surface p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-semibold">{s.job_name} · {s.printer_name}</p>
                <StatusPill level={live ? "ok" : "info"} label={`${s.status} · layer ${s.current_layer}/${s.total_layers}`} />
                <Button variant="ghost" className="ml-auto" onClick={() => nav(`/prints/${s.id}/live`)}>Open live</Button>
              </div>
              {!live ? <p className="text-sm text-text-muted">Start this print from the operator's or engineer's control bar; the controls below unlock once it runs.</p> : (
                <div className="flex flex-wrap items-end gap-6 text-sm">
                  <label className="flex flex-col gap-1">Replay speed
                    <span className="flex gap-2"><input type="number" min={1} max={200} value={speed[s.id] ?? 10} onChange={(e) => setSpeed({ ...speed, [s.id]: Number(e.target.value) })} className="w-20 rounded-ctl border border-border px-2 py-2" />
                      <Button variant="secondary" onClick={() => call(`/demo/sessions/${s.id}/speed`, { multiplier: speed[s.id] ?? 10 }, `Speed set to ${speed[s.id] ?? 10}×`)}>Set</Button></span>
                  </label>
                  <label className="flex flex-col gap-1">Jump to layer
                    <span className="flex gap-2"><input type="number" min={1} max={s.total_layers ?? 99} value={layer[s.id] ?? Math.min((s.current_layer || 1) + 1, s.total_layers ?? 99)} onChange={(e) => setLayer({ ...layer, [s.id]: Number(e.target.value) })} className="w-20 rounded-ctl border border-border px-2 py-2" />
                      <Button variant="secondary" onClick={() => { const l = layer[s.id] ?? Math.min((s.current_layer || 1) + 1, s.total_layers ?? 99); call(`/demo/sessions/${s.id}/jump`, { layer: l }, `Jumping to layer ${l}`); }}>Jump</Button></span>
                  </label>
                  <div className="flex flex-col gap-1">Triggers
                    <span className="flex gap-2">
                      <Button variant="secondary" onClick={() => call(`/demo/sessions/${s.id}/trigger`, { event: "sensor_drop" }, "Temperature sensor dropped for 8 s")}>Sensor drop</Button>
                      <Button variant="secondary" onClick={() => call(`/demo/sessions/${s.id}/trigger`, { event: "temp_spike" }, "Temperature spike for 20 s")}>Temperature spike</Button>
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">Reliability
                    <Button variant="secondary" onClick={() => call(`/demo/sessions/${s.id}/disconnect`, { seconds: 8 }, "Network drop: viewers disconnected for 8 s")}><WifiOff aria-hidden className="h-4 w-4" /> Drop connection 8 s</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

export function SettingsPage() {
  const me = useAuth((s) => s.me);
  const nav = useNavigate();
  const [muted, setM] = useState(mutedNudges());
  const flip = (t: NudgeType) => { setMuted(t, !muted.has(t)); setM(mutedNudges()); };
  const replay = async () => {
    await saveOnboarding({ welcome_done: false, role_seen: false, tour_done: false, dismissed: false }).catch(() => undefined);
    nav("/onboarding/welcome");
  };
  const role = { operator: "Operator", engineer: "Engineer", admin: "Administrator", manager: "Manager" }[me?.role ?? "operator"];
  return (
    <AppShell title="Settings" subtitle="Your profile and notification preferences">
      <div className="grid max-w-4xl gap-6 p-4 sm:p-6 lg:grid-cols-2">
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <p className="mb-3 font-semibold">Profile</p>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-xs text-text-muted">Name</dt><dd>{me?.full_name}</dd></div>
            <div><dt className="text-xs text-text-muted">Email</dt><dd>{me?.email}</dd></div>
            <div><dt className="text-xs text-text-muted">Role</dt><dd>{role} · set by your administrator</dd></div>
            <div><dt className="text-xs text-text-muted">2-factor authentication</dt><dd>{me?.mfa_enrolled ? <StatusPill level="ok" label="On" /> : <StatusPill level="warning" label="Not set up" />}</dd></div>
            <div><dt className="text-xs text-text-muted">Sites</dt><dd>{me?.sites.map((s) => s.name).join(", ")}</dd></div>
          </dl>
          <Button variant="secondary" className="mt-4" onClick={replay}>Replay the onboarding tour</Button>
        </section>
        <section className="rounded-card bg-surface p-4 shadow-sm">
          <p className="mb-1 font-semibold">Nudges</p>
          <p className="mb-3 text-sm text-text-muted">Muted nudges still appear under the bell. Critical alerts are never muted.</p>
          {NUDGE_TYPES.map((n) => (
            <label key={n.type} className="flex cursor-pointer items-start justify-between gap-3 border-t border-border py-3 text-sm">
              <span><span className="block font-medium">{n.label}</span><span className="text-xs text-text-muted">{n.hint}</span></span>
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--brand-600)]" checked={!muted.has(n.type)} onChange={() => flip(n.type)} aria-label={`Show ${n.label}`} />
            </label>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
