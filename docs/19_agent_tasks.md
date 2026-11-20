# 19 · Agent Task Breakdown

## How to run
- Repo root has `CLAUDE.md` (auto-read). Specs live in `docs/`.
- Tasks inside a phase marked ∥ can run in parallel (separate agents, ideally separate git worktrees/branches merged by a human).
- **Standard preamble** for every agent prompt:

> You are implementing PRIME, a FastAPI + React + Postgres web app for the CSC 4330 final demo. Read `CLAUDE.md`, then `docs/00_project_context.md`, then the spec files named in your task. Follow the data model in `docs/11_data_model.md` and API in `docs/12_api_spec.md` exactly; if you must deviate, explain why in your final message. Write tests for what you build and run them. Don't modify files outside your task's scope. Finish with: files changed, how to run/verify, open questions.

## Status
| Phase | State |
|---|---|
| **Phase 0 · Foundation** | ✅ **Done Nov 20** (T0.1–T0.4). See "Phase 0 results" below. |
| **Phase 1 · Backend core** | ✅ **Done Nov 20** (T1.1–T1.6). See "Phase 1 results". |
| Phase 2 · ML + front-end shell | ⏭ next: T2.1 model service hooks into `RUNNER_SETUP_HOOKS` / `checkpoint_hooks`; T2.4 front-end shell |

### Phase 0 results
- **T0.1** Repo scaffold: `backend/` (FastAPI, `/api/v1/health`), `frontend/` (Vite + React + TS + Tailwind with team tokens, foundation page), `docker-compose.yml`, `Makefile`, `.env.example`. Verified: API + DB health from the browser.
- **T0.2** All 29 tables via SQLAlchemy models + Alembic migration `initial schema` (upgrade/downgrade tested); idempotent seed (`python -m app.seed.seed [--reset]`), demo users with fixed TOTP secrets.
- **T0.3** Ingest pipeline `python -m app.replay.source_csv ingest-all` + mappings for 5 datasets (4 generated + the lab sheet) → parquet + data reports.
- **T0.4** `ml/MODEL_REPORT.md`, `ml/model_config.yaml`; both pickles load (sklearn 1.8.0, xgboost 3.4.1); **real inputs/outputs documented in `docs/20_data_and_models.md`**.
- Tests: backend 6 passed (seed idempotency, DB constraints, model feature order, dataset reproduces model outputs, demo story assertions); frontend 1 passed.

### Phase 1 results
- **Demo logins** (2FA code **246810** works for every `@prime.demo` user while `DEMO_MODE=true`):
  `admin@prime.demo` / `admin123` (Admin) · `engineer@prime.demo` / `engineer123` (Engineer, assigned to the live demo sessions so escalations reach them) · persona users (`maya@`, `dev@`, `sam@`, `jordan@`, …) keep `Prime!2026`. TOTP secrets are 32-char base32 strings printed by the seed.
- **T1.1** `app/api/v1/auth.py`: login → single-use 5-min MFA token → TOTP/demo code → 15-min access JWT + rotating httpOnly refresh cookie; remember-device cookie (30 d) skips 2FA; lockout 5 tries / 5 min; enrollment with QR SVG for new users. `core/rbac.py` = permission matrix (tested cell by cell), `core/audit.py`, uniform error envelope `core/errors.py`.
- **T1.2** routers: `/users`, `/sites`, `/me`, `/me/onboarding`, `/me/notifications`, `/printers` (+ active session), `/printers/{id}/sensors[/test]`, `/jobs`, `/sessions` (list/create/detail with limits + latest reading).
- **T1.3** `app/replay/runner.py` + `manager.py` + `scenario.py`, scenario files `data/scenarios/demo.yaml` and `background.yaml`. Start/pause/resume/stop (measured 6–70 ms), checkpoint + layer rows, adjustments applied at the next layer start (interlayer-delay changes extend the delay), automatic switch to `demo_wp03_noaction` from layer 6 if no RPM change was requested by layer 5, restart recovery from `replay_cursor`, yesterday's WP-02 print backfilled by the seed. Arm-01 calm print autostarts in demo mode.
- **T1.4** `app/ws/hub.py`: `/ws?token=`, channels `session:`/`site:`/`user:`, per-channel seq, 2,000-event replay buffer (`last_seq` resume, `resync_required` when too old), heartbeat 5 s, `/demo/sessions/{id}/disconnect` network-drop simulation.
- **T1.5** `app/alerts/engine.py`: out-of-range (3 readings) → critical (2) → auto-resolve (10), sensor-lost (5 s), rapid temperature change (info); geometry checked only while printing; notifications to operator (critical also engineer); `/alerts`, acknowledge, resolve, `/sessions/{id}/escalate` (receipt: "Demo Engineer (Engineer) was notified · usually responds in ~2 min").
- **T1.6** `/sessions/{id}/readings` (bucketed by print time, ≤ 600 points; `raw=true` Engineer/Admin only), `/sessions/{id}/layers` (with 4 checkpoints each), `/sessions/{id}/layers/{n}/frame`, `/dashboard/summary`.
- **Demo controls** (Admin, DEMO_MODE): `/demo/reset`, `/demo/sessions/{id}/speed|jump|trigger|disconnect` (triggers: `sensor_drop`, `temp_spike`).
- **Tests:** 86 passed (auth flows, RBAC matrix 60 cells + endpoint 403s, alert rules, replay determinism, branch/no-action, adjustment + delay extension, pause/stop latency < 300 ms, restart resume, WS buffer resume/resync/drop, escalation, history endpoints). Live smoke test over HTTP + WebSocket reached the layer-5 width warning as scripted.
- **Deviations from docs/12:** flag-artifact is `POST /checkpoints/{id}/flag-artifact` (frames are per vision checkpoint); readings filter by print time (`from_s`, `to_s`, `last_s`) instead of timestamps; `adjust_param` includes `interlayer_delay`; WS envelopes also carry `channel`.

## Phase 0 · Foundation (Nov 20–21)
| ID | Task | Specs | Acceptance |
|---|---|---|---|
| T0.1 | Scaffold monorepo: backend (FastAPI app factory, config, db, health route), frontend (Vite+TS+Tailwind with Milestone II tokens), `docker-compose.yml`, `Makefile`, `.env.example`, lint/format (ruff, eslint, prettier), CI-free `make test` | 10 | `docker compose up` → `/api/v1/health` 200 and React page renders with tokens |
| T0.2 | ORM models + Alembic migration for **all** tables, enums, constraints, indexes; `seed.py` (users with fixed TOTP secrets, site, printers, sensors, limits, jobs, badges) | 11 | `make seed` idempotent; constraint tests (manual adjustment needs note; one active session per printer) pass |
| T0.3 ∥ | Ingest pipeline + mapping files for Kasra's CSVs + data reports | 14 §1–3 | each CSV → parquet + `datasets` row + `data/reports/*.md`; ambiguous columns listed as questions |
| T0.4 ∥ | `ml/inspect_models.py` → `ml/MODEL_REPORT.md`; find working library versions; draft `model_config.yaml` | 15 §1–2 | both pickles load in the backend container; smoke predictions printed; **human confirms semantics** |

## Phase 1 · Backend core (Nov 22–24)
| ID | Task | Specs | Acceptance |
|---|---|---|---|
| T1.1 | Auth: login, MFA verify/enroll, refresh/logout, lockout, remember-device; RBAC module + matrix tests; audit dependency | 12 §1, 13 | full matrix test green |
| T1.2 ∥ | CRUD routers: users, sites, printers (+ live status), sensors (+ test), jobs, sessions (create/list/get) | 12 §2–3 | 403s verified per role |
| T1.3 | Replay engine: SessionRunner, scenario loader + override math, adjustment response, persistence/resume, control endpoints (start/pause/resume/stop) | 14 §4–6, 17 §1 | determinism test; stop latency < 300 ms; restart resumes |
| T1.4 | WebSocket hub: auth, channels, seq numbers, replay-from-seq buffer, heartbeat; `/demo` disconnect simulation | 12 §10 | reconnect test recovers missed events |
| T1.5 ∥ | Alert engine + alerts/escalation endpoints + notifications | 17 §2–3, 12 §6 | rule + hysteresis tests |
| T1.6 ∥ | Readings/layers/frames endpoints with downsampling | 12 §4 | 2-hour session, 1 h window returns ≤ 600 points in < 200 ms |

## Phase 2 · ML + front-end shell (Nov 23–25)
| ID | Task | Specs | Acceptance |
|---|---|---|---|
| T2.1 | Model registry + adapters (pkl/joblib/json), FeatureBuilder from YAML, inference on `layer_completed`, back-fill observed values | 15 §2–3 | fixture prediction test matches MODEL_REPORT |
| T2.2 | Confidence/intervals + SHAP explanations + templates | 15 §4–5 | 2 readable reason lines per prediction |
| T2.3 | Recommendation engine + accept/modify/reject/manual endpoints + adjustments → runner | 15 §6, 17 §4, 12 §5 | demo scenario produces "246 → 262 RPM" at layer 41; accept changes later widths |
| T2.4 ∥ | Front-end foundation: router, AppShell/PrintLayout/TabletShell, api client + refresh, OpenAPI types, ws client + session store, permissions + LockedButton, component library ported from Milestone II | 16 §1–3 | Storybook-free component demo page `/dev/components` |
| T2.5 | Pages: Login/MFA/Enroll, Dashboard, Live Monitor (tiles, banner, control bar, hold-to-stop, connection pill) | 16 §2–3 | live values update from WS at 8×; operator can pause/stop |

## Phase 3 · Features (Nov 28–30)
| ID | Task | Specs |
|---|---|---|
| T3.1 ∥ | Vision page (frame + SVG calipers, measured vs target, flag artifact) | 16, 14 §7 |
| T3.2 ∥ | Trends page (signal picker, windows, predicted dashed line, annotations) | 16 §4 |
| T3.3 ∥ | AI Recommendations page (list, detail card, modify stepper, reject reasons, manual drawer, operator locked view, adjustment log) | 16, 15 §6 |
| T3.4 ∥ | Alerts center + escalation receipt + nudge queue + notifications bell | 17 §2–3, 9 |
| T3.5 ∥ | Reports: generation service, report page + print CSS, CSV/JSON export; Sessions list | 17 §6–7, 16 §5 |
| T3.6 ∥ | Admin users (+ create modal) + audit table | 13 |
| T3.7 ∥ | Onboarding flow + dashboard checklist; gamification (score, streak, badges, shift goal, achievements page) | 17 §5, 8, 10 |
| T3.8 | `/demo` control panel + `make reset-demo` | 12 §9 |

## Phase 4 · Hardening (Dec 1–2)
| ID | Task |
|---|---|
| T4.1 | Tune `data/scenarios/demo.yaml` with Kasra so every scripted moment lands on its layer at 8× (**human approval**) |
| T4.2 | Playwright e2e of the full demo script (`18` §2) at 20× + operator-only path |
| T4.3 | Verification agent: run `make test` + `make e2e`; walk every user story US-01…US-13 in the browser and record pass/fail with evidence; check offline cold start; list fixes ranked by demo risk (no edits) |
| T4.4 | Fix list from T4.3; polish empty/error states; performance check (no dropped frames on live page at 8×) |
| H | Humans: 3 rehearsals, backup video, slides |

## Example prompt (T1.3)
> [Standard preamble] Your task: **T1.3 Replay engine**. Implement `backend/app/replay/` per `docs/14_data_ingest_and_replay.md` §4–6 and the state machine in `docs/17_feature_logic.md` §1, plus the control endpoints in `docs/12_api_spec.md` §3. Use the processed dataset from T0.3 and `data/scenarios/demo.yaml`. Required tests: determinism (two runs identical), pause/resume/stop latency < 300 ms, resume after process restart from `replay_cursor`, override math for `set`, `add_ramp`, `ramp_from/ramp_to`, and the adjustment response formulas. Emit events through the WS hub interface from T1.4 (stub it if T1.4 isn't merged yet).
