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
Setup: window A = **Operator (Maya)** at 1024×768 (tablet view); window B = **Engineer (Dev)** desktop (separate Chrome profile); window C = **Admin (Sam)** in incognito with `/demo` open in a second tab. `make reset-demo` just before. Speed 8×.

| Time | Who / where | Action | User stories shown |
|---|---|---|---|
| 0:00 | Slides | 30-s problem + architecture diagram | — |
| 0:45 | A | Log in as Maya → 2FA code from phone → first-login onboarding: Welcome, Role (locks explained), tour step "practice hold-to-stop" | US-01, onboarding |
| 2:00 | C | As Sam (Admin): create user "Carlos M." as Engineer → role cards + MFA enforced. Meanwhile B is already signed in as Dev | US-02 |
| 3:00 | A | Dashboard → Gantry-02 "Start" (pre-check pills turn live) → Live Monitor: temp, RPM, power, speed, nozzle Ø updating | US-03, US-04 |
| 4:00 | A | Layer 41: **warning banner** "Layer width 36.4 mm below target" → tap View → Vision overlay confirms narrow bead → "Escalate to engineer" → receipt toast | US-05, US-06 |
| 5:00 | B | Notification → AI tab: "Increase pump speed 246 → 262 RPM · 87 %", why bullets (SHAP), predicted-effect chart → **Modify to 258 → Accept** | US-09, US-10 |
| 6:00 | A | Nudge "Applied at layer 43" → width tile recovers, clean-print streak restarts | US-10 effect |
| 6:30 | A | Layer 44: violet heads-up "interlayer delay predicted 228 s in ~6 layers" | predictive |
| 7:00 | B | Manual adjust: print speed 100 → 108 mm/s with note → shows as *independent decision* in log | US-11 |
| 7:30 | A | Trends: Layer width, 15 m window, predicted dashed line, annotations of alert + adjustment | US-08 |
| 8:00 | C `/demo` | `disconnect 8s` → pill "Reconnecting… 12 readings buffered" → "Reconnected, no data lost" | NFR reliability |
| 8:30 | A | Pause → Resume → **hold-to-stop** (or `/demo jump` to last layer to complete) | US-07 |
| 9:00 | B (Dev; or sign in as Jordan, Manager, if time allows) | Sessions → Report: KPIs, accuracy per model, summary → Export CSV + PDF | US-12, US-13 |
| 9:45 | A | Achievements: new *First Catch* badge, shift summary | gamification |

## 3. Rehearsal checklist (run 3 times: Dec 1, Dec 2, morning of Dec 3)
- [ ] `docker compose up` from cold works with **Wi-Fi off**
- [ ] `make reset-demo` < 5 s; seeded TOTP codes work from phone; backup code `246810` known
- [ ] Laptop: power adapter, sleep disabled, notifications off (Do Not Disturb), browser zoom 100 %, bookmarks for both windows, projector resolution tested (fallback: 1280×800 still fits the tablet layout)
- [ ] Each scripted moment hits its layer within ± 1 layer at 8×
- [ ] Time the run; target ≤ 10 min, leave 2–3 min for questions

## 4. Fallback plan
1. **Something breaks mid-demo:** `/demo` panel → `jump` to the next scripted layer, or `reset` and start at layer 40 (`start_layer` in scenario).
2. **Backend crash:** `docker compose restart backend`; runner resumes from the persisted cursor.
3. **Total failure:** play the **backup screen recording** (record the final rehearsal, 1080p, ~10 min, saved locally and on a USB stick).
4. **Projector issues:** run windows side by side at 1280 px; the tablet view still fits.

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

**Risk:** the script's escalate → review → modify sequence (§2, 4:00–5:00) needs about a minute, but nobody acting by the end of layer 5 switches the replay to the no-action branch after ~9 s, and the whole print is over ~1 min after the decision. **Proposal** (what `make e2e` does): keep 8×, and Maya presses **Pause** as soon as the warning appears (shows US-07 early, freezes print time); Dev decides with no time pressure; Maya presses **Resume**. For a calmer second half, the admin sets speed 4× from `/demo` after the decision (layers 6–8 then take ~1:35). Manual adjust (US-11) must happen before the print completes; Trends, the network drop and the report also work after completion. Kasra to approve before changing `demo.yaml` (`speed: 8`).

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
