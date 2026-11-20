# 06 · Onboarding + Cool Features (page 7)

> **Update (Nov 20, 2026):** real model inputs, units, value ranges and the demo story are now defined in [`20_data_and_models.md`](20_data_and_models.md). Where they differ, **doc 20 wins**.

## Part A · Onboarding (first login after MFA)
Goal from NFR Usability: *"minimal onboarding time before an operator can use the system confidently."* Target: **under 3 minutes, skippable, resumable.**

| # | Screen | Route | Content |
|---|---|---|---|
| S03 | Welcome | `/onboarding/welcome` | Left: ok + blue line illustration of a printer laying beads. Right: "Welcome to PRIME, Maya" with a Lucide `hand` icon, 3 value bullets with icons (*See every print condition live* · *Get warned before defects form* · *AI suggests, you decide*). Progress dots 1/4. `Get started` · "Skip setup". |
| S04 | Your role | `/onboarding/role` | "Your administrator set you up as **Operator** at **Bay 2**." Card listing *You can* (✓ view live data, ✓ pause/stop prints, ✓ escalate) and *Needs an engineer* (🔒 apply parameter changes, 🔒 raw data export). Builds trust in RBAC and explains locks before the user hits them. |
| S05 | Guided tour | `/onboarding/tour` | **Coach marks over the real Live Monitor (tablet)**, 5 steps: ① metric tile anatomy (value, range, status) ② alert banner ③ camera/Vision tab ④ **Hold-to-stop** with a practice ring "Try it: this is a simulation" ⑤ Escalate button. Darkened backdrop with a cutout spotlight; tooltip "Step 4 of 5", Back / Next / Skip. |
| S06 | Connect printer (Admin/Engineer) | `/onboarding/printer` | Stepper: Printer → Sensors → Camera calibration → Test. Sensor checklist rows with live pills (Thermocouple ● Live 24.6 °C, Pump encoder ● Live, Power meter ● Live, Camera ◐ Calibrating 70 %). `Run 30-second test`. |
| — | Onboarding checklist (persistent) | Dashboard widget | "Getting started 3/5" with progress bar in ok: ✓ Secure your account (MFA) ✓ Meet your dashboard ✓ Practice hold-to-stop ☐ Watch your first live print ☐ Acknowledge your first alert. Dismissible. |

**Page-7 placement (top half):** S03 Welcome + S04 Role as small desktop frames, S05 tour step 4 (tablet, coach mark on STOP) as the larger hero.

## Part B · Nudges (behavioral design, calm, never nagging)
Rules: max **1 nudge visible**, auto-dismiss 8 s, never covers the control bar, never during a critical alert, all nudges can be muted per type in Settings.

| Nudge | Trigger | Copy (exact) | Style |
|---|---|---|---|
| **Predictive heads-up** | AI predicts a value will leave its range within N layers | "Heads-up: interlayer delay is predicted to reach 228 s in ~6 layers (limit 240 s). Review AI suggestion →" | Charcoal toast, sparkles icon, viz-violet confidence dot |
| **Unacknowledged alert** | Warn alert open > 30 s | "Layer width warning has been open for 30 s. Acknowledge or escalate?" `Acknowledge` `Escalate` | warn-50 toast with ochre icon, gentle pulse once |
| **Escalation receipt** | Operator escalates | "Dev Patel (Engineer) was notified · usually responds in ~2 min." | Neutral, reassures the operator |
| **Decision closure** | Engineer accepted AI change | "Applied at layer 43. Width is recovering: 38.9 mm (+2.5 mm). Nice catch." | ok-50 toast, mini sparkline |
| **Shift hand-off** | 10 min before shift end | "Shift ends in 10 min. Leave a hand-off note for the next operator?" `Write note` | Neutral |
| **End-of-print summary** | Print completes | "WP-03 finished: Quality 94 · 0 critical alerts · Report ready" `Open report` | brand-700 |

## Part C · Gamified features (professional, team-positive, safety-first)
Design guardrail: reward **attention and quality**, never speed or ignoring alarms. No public leaderboard of individuals (avoids blame culture on a safety-critical floor); use **team/shift goals** instead.

1. **Print Quality Score (0–100)** shown live as a ring in the Live Monitor header and on reports. Formula shown in a tooltip: % of layers within tolerance × alert-response factor × prediction-adoption factor.
2. **Clean-Print Streak:** consecutive layers within all tolerances. Shown as a Lucide `layers` icon + "18-layer clean streak" (no emoji anywhere in the UI). Milestone pulses at 25 / 50 / 100 layers.
3. **Badges** (S16 Achievements page), 64 px medals:
   - *First Catch*: acknowledged an alert within 15 s
   - *Early Bird*: escalated a predicted issue before it became a defect
   - *Steady Hands*: 100 consecutive clean layers
   - *Model Partner*: reviewed 10 AI suggestions (accept, modify or reject all count)
   - *Calibrated*: completed camera calibration
   - *Safety First*: completed hold-to-stop practice
   Locked badges in gray with progress "7/10".
4. **Shift goal (team):** "Shift B goal: 3 prints with quality ≥ 90 · 2/3" progress bar, shown on Dashboard right column.
5. **Shift summary card** (end of shift): Your shift in numbers: Layers monitored 412 · Alerts handled 6 (avg response 11 s) · Defects prevented 2 · New badge: *First Catch*.

**Page-7 placement (bottom half):** S16 Achievements (desktop, medium) + 2 nudge toasts shown on a cropped Live Monitor + Quality score ring close-up. Caption explains the guardrail ("rewards attention and quality, never speed").
