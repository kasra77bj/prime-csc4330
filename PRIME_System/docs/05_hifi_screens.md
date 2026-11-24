# 05 · Hi-Fi Screen Specs (pages 4–6; onboarding + cool features in `06_…`)

> **Update (Nov 20, 2026):** real model inputs, units, value ranges and the demo story are now defined in [`20_data_and_models.md`](20_data_and_models.md). Where they differ, **doc 20 wins**.

All screens use tokens/components from `01_design_system.md` and data from `src/data/mock.json`.
Desktop frame **1440×900**, tablet frame **1024×768**. Every screen: real copy (no lorem ipsum), realistic numbers, Lucide icons, Inter.
File naming: `src/screens/S07-dashboard.html` → `exports/S07-dashboard@2x.png`.

---

## S01–S02 · Login + MFA (US-01) · Desktop
- Split layout: left 50 % brand-700 panel with the white stacked logo, tagline, and a subtle line-art illustration of layered beads (SVG, ok + brand-600 strokes at 30 % opacity). Right 50 % white form, 400 px column.
- **Login:** "Sign in to PRIME", Email, Password (show/hide), "Remember this device for 30 days" checkbox, primary `Sign in`, "Forgot password?" link. Footer: "Secured with 2-factor authentication · Encrypted in transit and at rest" with lock icon.
- **MFA:** "Enter the 6-digit code from your authenticator app", 6 separate 56 px boxes (3 filled), `Verify`, "Use a backup code" link, "Code expires in 0:24".
- Page-4 placement: both screens side by side at small scale (each ~45 % width), under the Dashboard.

## S07 · Home / Dashboard (US-03/04/06 overview) · Desktop  ★ main page-4 image
- **Sidebar (charcoal #23272B):** logo, nav items with icons: Dashboard (active), Live prints, Alerts (badge 2), AI suggestions (badge 1), Sessions, Achievements, Admin (lock if not admin), Settings. Bottom: help, collapse.
- **Top bar:** page title "Good afternoon, Dev", date/shift "Fri Oct 9 · Shift B", search, connection pill "● All sensors live", bell (2), role badge "Engineer", avatar.
- **Row 1 KPI cards (4):** Active prints **2** · Open alerts **2** (1 warn, 1 info) · AI suggestions pending **1** (sparkles icon, brand-50 card) · Shift quality score **94 / 100** (+3 vs yesterday, sparkline).
- **Row 2 printer cards (3):**
  - *Gantry-02 · Bay 2*: "Wall Panel WP-03", layer 42/120 progress bar, 4 mini values (Temp 24.6 °C, RPM 246, Speed 100 mm/s, Width 38.1 mm) with a **warn pill "Width trending −5 %"**, buttons `Open live` (primary), `Vision`.
  - *Arm-01 · Bay 1*: "Column C-12", layer 88/96, all in range (just a small green dot "In range").
  - *Gantry-03 · Bay 3*: Idle, "Next job: Footing F-2 at 15:30", `Start pre-check`.
- **Right column (360 px):** "Needs your attention": 1 AI card preview (brand-50 AI card: "Increase pump speed to 262 RPM · 87 % confidence · Review"), "Recent alerts" list (3 rows with time, icon, text), "Shift goal" mini card (gamification hook: "Clean-print streak: 6 layers", see `06_…`).
- Whitespace: 24 px gutters; no more than 3 visual weights per card.

## S08 · Live Print Monitor (US-03/04/06/07) · **Tablet** ★ main page-5 image
- **Top bar (64 px):** back chevron, "WP-03 · Gantry-02", tabs `Live` (active) · `Vision` · `Trends` · `AI`, connection pill, role badge "Operator", avatar.
- **Warning banner** (warn-50 #FBF3E4 background, ochre icon, text #1C1E21): ⚠ "Layer width 36.4 mm is below target (40 ± 3) and dropping. Check Vision." `View` · `Acknowledge` · "0:42 ago".
- **Metric grid 3×2** (big tablet tiles, values 44 px):
  1. Material temperature 24.6 °C · Normal 18–30 · sparkline · ● In range
  2. Pump speed 246 RPM · Normal 180–320
  3. Pump power 1.9 kW · Normal 1.2–2.8
  4. Print speed 100 mm/s · Nozzle Ø 30 mm (secondary line), US-04
  5. Layer width **36.4 mm** · Target 40 ± 3 · **ochre (#B7791F) left border + "▼ −9 %" warning pill**
  6. Interlayer delay 132 s · Predicted next 151 s · AI chip
- **Strip:** layer progress "Layer 42 of 120 · 35 %" bar · elapsed 01:12:40 · ETA 02:05:00 · camera thumbnail (tap → Vision) · `Escalate to engineer` secondary button with user icon.
- **Persistent control bar (72 px):** left "WP-03 · Layer 42/120"; right `⏸ Pause` (56 px) `▶ Resume` (disabled while running) `■ STOP` (64 px, critical #C62828 fill, label "Hold to stop").
- Second variant to show on page 5 (small, ~35 % width): **"Hold to stop" in progress** (ring 70 %) or **Reconnecting state** (pill ◐ "Reconnecting… 12 readings buffered, nothing lost"), which demonstrates NFR Reliability.

## S09 · Vision (US-05) · Tablet
- Large camera frame (use a **generated/clean illustration or real photo of a concrete bead**; no blurry stock). Overlay (white + brand-600 only) with measurement lines: horizontal width caliper "36.4 mm", vertical height caliper "14.8 mm", detected bead edges as thin brand-600 polylines, ROI box.
- Right rail (300 px): Measured vs Target table (Width 36.4 / 40.0 → −9 % warn, Height 14.8 / 15.0 → −1 % ok), mini chart width over last 10 layers, "Measurement confidence 93 %", toggle "Show overlay", button "Flag as artifact" (US-05: confirms it's the real bead, not an artifact).
- Same control bar.

## S10 · Trends (US-08) · Desktop
- Left panel: signal checklist with color keys (Material temp, Pump RPM, Pump power, Print speed, Layer width, Layer height, Interlayer delay).
- Time chips: 5 m · 15 m · **1 h** (selected) · Whole print · Custom (date-time range).
- Main chart (Layer width selected): measured line in text #1C1E21, target band brand-50, limit lines critical dashed, warning-zone shading in viz-ochre at 15 %, **AI predicted next 10 min in viz-violet #7E57A6 dashed**; second series (if selected) in viz-teal #3C665E, hover tooltip "14:32:10 · 36.9 mm · Layer 41".
- Below: stat cards Min 36.4 · Max 40.8 · Avg 38.7 · σ 1.1, and "Annotations" (Alert raised 14:31, Pump adjusted 14:35).
- Export button `Download view (CSV)` disabled for Operator with lock tooltip.

## S11 · AI Recommendations + Manual Adjust (US-09/10/11) · Desktop ★ main page-6 image
- Left list (360 px): tabs Pending (1) · Accepted (4) · Rejected (1) · Manual (2). Each item: time, title, confidence chip.
- Right detail (AI card: brand-50 background, brand-600 left border, "✦ AI" chip):
  - Title: **"Increase pump speed 246 → 262 RPM"** · `AI` chip · confidence **87 %** bar.
  - *Why:* "Layer width has dropped 9 % over 6 layers while pump power is stable → under-extrusion." "Material temperature rising (+1.8 °C/30 min) is increasing viscosity."
  - *Predicted effect:* mini chart: width returns to 39.6 ± 0.8 mm within 3 layers (viz-violet dashed prediction vs text-colored actual).
  - *Risk:* "Low: within pump limits (max 320 RPM)."
  - Buttons: `Accept` (primary), `Modify` (secondary, opens an inline number stepper with 258 typed), `Reject` (ghost, requires a reason dropdown: "Sensor artifact / Material change planned / Disagree with model / Other").
  - Footnote: "Changes apply at next layer start. Logged to audit trail as *Dev Patel · Engineer*."
- **Manual adjust drawer** (show as a second, smaller frame): "Adjust without AI recommendation", parameter select (Pump RPM / Print speed), current → new value stepper, required note, checkbox "Log as independent engineer decision" (pre-checked, disabled = always logged), `Apply at next layer`.
- Operator view variant (tiny thumbnail): same card with buttons replaced by a lock "Engineer approval required · Escalate".

## S12 · Alerts center (US-06) · Desktop (small)
Table: severity icon+label, signal, message, printer/job, raised at, status (Open / Acknowledged / Resolved), owner. Filters chips. Row expanded shows the mini chart at the alert time. Use only if page 6 has room, else appendix.

## S14 · Session Report + Export (US-12/13) · Desktop ★ page-6 image
- Header: "Session report · WP-03 · Gantry-02", Oct 8, 2026, 13:20–15:25 (2 h 05 m), status "Completed", buttons `Export ▾` (CSV · JSON · PDF report) and `Share link`.
- KPI cards: Quality score 94 · Layers 120/120 · Alerts 5 (0 critical) · Adjustments 6 (4 AI-accepted, 1 modified, 1 manual) · **Prediction accuracy 91 %** (MAE 0.7 mm width).
- Charts: "Predicted vs observed layer width" (two lines), "Alerts timeline" (dots on a time axis).
- Table: Parameters used (start / end / min / max).
- Adjustment log table: time, by, type (AI accepted / modified / rejected / manual), from → to, note.
- Auto-generated summary paragraph in an AI-tinted box: "The print finished on schedule. One under-extrusion episode at layer 41 was corrected by a +16 RPM adjustment…" with "Generated by PRIME AI · editable".

## S15 · Admin › Users (US-02) · Desktop
Table of users (avatar, name, email, role pill, MFA status ✓/pending, last active) + **"Create user" modal**: name, email, role radio cards (Operator / Engineer / Administrator, each with a one-line "can do" description), site/bay access multiselect, "Require MFA enrollment on first login" (locked on), `Send invite`.

---

## Page assignment (keep each page uncluttered)
| Page | Main frame (large, ~65 % width or full width) | Secondary frames (small) |
|---|---|---|
| 4 Home | S07 Dashboard (full width) | S01 Login + S02 MFA (side by side) |
| 5 Core I | S08 Live Monitor tablet (large, in a tablet device frame) | S09 Vision · S08 reconnect/hold-to-stop variant |
| 6 Core II | S11 AI Recommendations | S14 Session Report · S10 Trends (S15 Admin → appendix if crowded) |
| 7 Onboarding + Cool | see `06_onboarding_gamification.md` | |

Each frame gets a caption: **Screen name · route · user stories** (e.g., "Live Print Monitor · /prints/:jobId/live · US-03, 04, 06, 07") plus 1–2 callout numbers pointing to key design decisions (max 3 callouts per frame), explained in a short legend underneath.
