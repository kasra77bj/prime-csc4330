# 18 · Testing, Demo Script & Rehearsal

> **Update (Nov 20, 2026):** real model inputs, units, value ranges and the demo story are now defined in [`20_data_and_models.md`](20_data_and_models.md). Where they differ, **doc 20 wins**.

## 1. Test plan
| Layer | Tool | Must cover |
|---|---|---|
| Unit (backend) | pytest | RBAC matrix (every permission × role), feature builders, scenario override math, adjustment response math, alert rules + hysteresis, quality score, recommendation clamping/limits |
| ML | pytest | pickles load with pinned versions; feature order matches `model_config.yaml`; predictions on a fixture row equal the values recorded in `MODEL_REPORT.md` (± 1e-6); SHAP returns 2 factors |
| API | pytest + httpx | auth + MFA happy/fail paths, lockout, each endpoint's 403 for wrong role, export file contents |
| Replay | pytest | **determinism:** running `demo.yaml` twice yields identical readings/alerts/recommendations; pause/resume/stop latency < 300 ms; restart-resume |
| WebSocket | pytest | subscribe, `last_seq` resume after disconnect delivers missed events, heartbeat |
| Front end | Vitest + Testing Library | MetricTile status logic, HoldToStopButton timing, LockedButton per role |
| End-to-end | Playwright | **the full demo script below** run headless at speed 20×; also an operator-only path |

`make test` runs backend + frontend unit tests; `make e2e` runs Playwright against `docker compose up`. All green before each rehearsal.

## 2. Demo script (~10 minutes, three browser windows on one laptop)
Setup: window A = **Operator (Maya)** at 1024×768 (tablet view); window B = **Engineer** desktop signed in as `engineer@prime.demo` ("Demo Engineer", the print's assigned engineer, so escalations and AI notifications reach this window; separate Chrome profile); window C = **Admin (Sam)** in incognito with `/demo` open in a second tab. `make reset-demo` just before. Numbers below are from docs/20 §4; times after 3:00 come from the measured timeline in §5.

**The one rule of this script:** layer 5 gives the engineer only ~9 s at 8× before the replay switches to the "nobody acted" branch, so Maya presses **Pause as soon as the yellow banner appears**. The print stays paused (print time frozen) while she checks Vision and escalates and the engineer decides, then she presses **Resume**.

| Time | Who / where | Action | User stories shown |
|---|---|---|---|
| 0:00 | Slides | 30-s problem + architecture diagram | — |
| 0:45 | A | Log in as Maya → 2FA code from phone → first-login onboarding: Welcome, Role (locks explained), tour step 4 "practice hold-to-stop" | US-01, onboarding |
| 2:00 | C | As Sam (Admin): create user "Carlos M." as Engineer → role cards + 2FA enforced, temporary password shown once. Meanwhile B is already signed in as the engineer | US-02 |
| 3:00 | A, C | Maya: Dashboard → Gantry-02 "Open to start" → **Start print** (2-s sensor pre-check) → Live Monitor: temperature, pump RPM, motor power, speed, nozzle N2 updating. Sam: `/demo` → replay speed **8×** (`demo.yaml` plays 10× until Kasra approves `speed: 8`) | US-03, US-04 |
| ~4:11 | A | Layer 5: **warning banner** "Layer width … mm is below target (19.5 ± 1 mm)" → **Pause** at once ("Paused on layer 5") → View → Vision overlay confirms the narrow bead → Live → Acknowledge → "Escalate to engineer" → receipt toast | US-05, US-06, US-07 |
| ~4:30 | B | Notification → AI tab (Maya sees "Demo is reviewing"): "Increase pump speed 27 → 33 RPM", why bullets (SHAP), predicted-effect chart → **Modify to 34 → Apply**. No time pressure: the print is paused | US-09, US-10 |
| ~5:30 | A, C | Maya: **Resume**. Sam: `/demo` speed **4×** so the second half is easy to follow (layers 6–8 then take ~1:55) | US-07 |
| ~5:50 | A | Nudge "Change applied at layer 6" → width tile recovers to ~19.5 mm | US-10 effect |
| ~6:30 | A, B | Layer 7: violet heads-up on Maya's tablet; the engineer sees "Increase interlayer delay 5 → 10 min" (~53 %) → Accept | predictive |
| ~6:40 | B | Manual adjust (before layer 8 starts at ~7:00): pump speed +1 RPM with a note → shows as *Manual (independent decision)* in the log | US-11 |
| ~6:55 | C `/demo` | Drop connection 8 s → pill "Reconnecting…" → toast "Reconnected, no data lost" | NFR reliability |
| ~7:25 | A | Print completes → "report ready" nudge. Trends: Whole print, Pump speed with the AI dashed line, annotations of the alert and both applied changes | US-07, US-08 |
| 8:30 | B (engineer; or sign in as Jordan, Manager, if time allows) | Sessions → Report: KPIs, model agreement, generated summary → Export CSV + PDF | US-12, US-13 |
| 9:15 | A | Achievements: badges with progress, clean-print streak, team shift goal, shift summary | gamification |

## 3. Rehearsal checklist (run 3 times: Dec 1, Dec 2, morning of Dec 3)
- [ ] `docker compose up` from cold works with **Wi-Fi off**
- [ ] `make reset-demo` < 5 s; seeded TOTP codes work from phone; backup code `246810` known
- [ ] Laptop: power adapter, sleep disabled, notifications off (Do Not Disturb), browser zoom 100 %, bookmarks for both windows, projector resolution tested (fallback: 1280×800 still fits the tablet layout)
- [ ] Each scripted moment hits its layer within ± 1 layer at 8×
- [ ] Time the run; target ≤ 10 min, leave 2–3 min for questions

## 4. Fallback plan
1. **Pause missed at layer 5** (red banner at layer 6: the replay took the no-action branch): PRIME **pauses the print automatically** ("Print paused automatically" banner). Explain the critical alert, then the engineer clicks **Review AI suggestion** and accepts it: the print resumes and returns to the corrected track at the next layer. (Or Maya uses **hold-to-stop**, then `/demo` → reset.)
2. **Something else breaks mid-demo:** `/demo` panel → jump to the next scripted layer, or reset and start again.
3. **Backend crash:** `docker compose restart backend`; runner resumes from the persisted cursor.
4. **Total failure:** play the **backup screen recording** (record the final rehearsal, 1080p, ~10 min, saved locally and on a USB stick).
5. **Projector issues:** run windows side by side at 1280 px; the tablet view still fits.

## 5. Measured demo timeline (Phase 4, T4.1 · needs team approval)
Computed from the datasets and `demo.yaml` (precheck 2 s, delay rows compressed 10×): layer *L* starts at `2 + (L−1)·126 / speed` s after **Start print** (96 s printing + 300 delay rows per layer). Times below are after Start.

| Moment | Print-time trigger | at 8× (docs/18) | at 10× (`demo.yaml` today) |
|---|---|---|---|
| AI suggestion "pump 27 → 33 RPM" (updates to 34 at checkpoint 3) | layer 5, checkpoint 2 (48 s) | 1:11 | 0:57 |
| Width warning banner | layer 5, 51 s | 1:11 | 0:58 |
| **Last moment to decide** (still the main track) | end of layer 5's delay | **1:21** (window ≈ 9 s) | **1:05** (≈ 7 s) |
| "Change applied at layer 6" nudge | layer 6 start | 1:21 | 1:05 |
| Interlayer-delay suggestion 5 → 10 min | layer 7, checkpoint 2 | 1:43 | 1:22 |
| Print completed → report | end of layer 8 | 2:04 (+4 s if the 10-min delay is accepted) | 1:40 |

**Risk:** the original script's escalate → review → modify sequence needed about a minute, but nobody acting by the end of layer 5 switches the replay to the no-action branch after ~9 s, and the whole print is over ~1 min after the decision. **Applied to the §2 script (Nov 24)** (`make e2e` does the same): keep 8×, and Maya presses **Pause** as soon as the warning appears (shows US-07 early, freezes print time); the engineer decides with no time pressure; Maya presses **Resume**. For a calmer second half, the admin sets speed 4× from `/demo` after the decision (the print then completes ~1:55 after Resume). Manual adjust (US-11) must happen before the print completes; Trends, the network drop and the report also work after completion. Kasra to approve before changing `demo.yaml` (`speed: 8`).

## 6. Verification (Phase 4, T4.3, Nov 24 2026)
`make test` (backend 98 passed, frontend 6 passed) and `make e2e` (`frontend/e2e/demo.mjs`, 25/25 steps, run twice, no page errors). The e2e resets the demo, runs the §2 script at 20× with Maya (tablet 1024×768), Demo Engineer, Sam (admin) and Jordan (manager) in separate browsers, then the operator-only path (nobody acts → critical → hold-to-stop). Screenshots: `frontend/e2e/screenshots/` (git-ignored).

| Story | Result | Evidence |
|---|---|---|
| US-01 Login + 2FA | Pass | e2e "signs in with 2FA" (all four roles); `test_auth.py` (TOTP, lockout, remember device, enrollment) |
| US-02 Create users, roles | Pass | e2e "admin creates an engineer; 2FA enrollment is forced"; `test_auth.py::test_admin_creates_user_who_must_enroll` |
| US-03 Live temperature | Pass | e2e "live temperature, speed and nozzle update" |
| US-04 Speed + nozzle | Pass | same step (Nozzle N2, flow, speed tile) |
| US-05 Camera overlay | Pass | e2e "View opens Vision with the measured bead overlay" (`04_vision.png`) |
| US-06 Out-of-range alert | Pass | e2e warning banner, acknowledge, escalate receipt, critical banner on every print tab; `test_alert_rules.py` |
| US-07 Pause / resume / stop | Pass | e2e pause at the warning, resume, hold-to-stop on a live print; `test_replay.py` latency < 300 ms |
| US-08 Graph any value | Pass | e2e trends step (whole print, model line, annotations, CSV locked for operator) |
| US-09 AI proposes with reason | Pass | e2e "AI suggestion with reasons and predicted effect"; `test_ml_loop.py` |
| US-10 Accept / modify / reject | Pass | e2e modify → applied at layer 6, accept delay; reject covered by `test_ml_loop.py` |
| US-11 Manual adjustment | Pass | e2e "manual adjustment logged as an independent decision" |
| US-12 Download CSV / JSON | Pass | e2e manager downloads zip + json, print layout hides navigation; `test_phase3.py::test_exports_csv_zip_and_json` |
| US-13 Summary report | Pass | e2e manager opens the generated report (`09_report.png`); `test_phase3.py` |
| Reliability NFR | Pass | e2e network drop → "Reconnecting…" → "Reconnected, no data lost" |
| Offline | Pass (static check) | built bundle has no external URLs (fonts bundled); backend makes no outbound calls. Cold start with Wi-Fi off still to rehearse on Kasra's laptop (`docker compose up`). |
| Performance | Pass | 0 main-thread tasks > 50 ms on the operator's live page during the run (20×, stricter than 8×) |

**Fixed during verification (T4.4):** the "Reconnected, no data lost" toast was never shown (now shown by `ws/socket.ts`); report summary grammar ("1 alert was", rounded score); the e2e now waits for the Live page before acting (each print tab mounts its own control bar).
**Ranked remaining demo risks:** 1) the 9-s decision window above (needs the Pause step or a speed change); 2) `docker compose build` must run once while online before the demo day; 3) rotating refresh cookies: two tabs of the *same* browser profile reloading at the same moment can sign one out, so use separate profiles per role as §2 already says.
