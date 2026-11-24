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
