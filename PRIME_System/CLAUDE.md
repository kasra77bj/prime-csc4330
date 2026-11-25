# CLAUDE.md · PRIME (working system for the final demo)

CSC 4330 Software System Development, Fall 2026 · Team: Kasra Banijamali, Carlos Manosalvas · **Demo: Thu Dec 3, 2026, on Kasra's laptop (offline)**

PRIME replays real concrete-3D-printing sensor logs as live data, runs the team's **XGBoost (extrusion rate)** and **Random Forest (interlayer delay)** models per layer, raises alerts, and lets engineers accept/modify/reject AI adjustments. Every user story US-01…US-13 must work in the demo.

## Stack
FastAPI (Python 3.11) · SQLAlchemy 2 + Alembic · PostgreSQL 16 · WebSockets · React 18 + Vite + TypeScript + Tailwind · TanStack Query · Zustand · Recharts · Docker Compose.

## Read before any task
**`docs/20_data_and_models.md` first** (real model inputs, units, datasets, demo story; it overrides older numbers) → `docs/00_project_context.md` (users, stories, data ranges) → `docs/01_design_system.md` (colors/components) → the spec files named in your task (list in `docs/19_agent_tasks.md`).
| Spec | Covers |
|---|---|
| `docs/10_architecture.md` | Services, repo layout, env, compose, version pins |
| `docs/11_data_model.md` | Tables, relationships, enums, constraints, seed |
| `docs/12_api_spec.md` | REST endpoints + roles, WebSocket protocol |
| `docs/13_auth_rbac.md` | Login, 2FA, permission matrix |
| `docs/14_data_ingest_and_replay.md` | CSV mapping, replay engine, demo scenario overrides |
| `docs/15_ml_integration.md` | Pickles, features, inference, recommendations, SHAP |
| `docs/16_frontend.md` | Routes, components, live behavior, charts |
| `docs/17_feature_logic.md` | State machine, alerts, reports, gamification, nudges |
| `docs/18_testing_and_demo.md` | Tests, demo script, rehearsal |

## Repo layout (actual)
`backend/` FastAPI app (`app/models` = all 29 tables, `app/replay/source_csv.py` ingest, `app/seed/seed.py`) · `frontend/` React app · `ml_models/` **the team's pickles (do not modify; git-ignored)** · `ml/` `model_config.yaml`, `MODEL_REPORT.md`, `inspect_models.py` · `raw_data/raw.xlsx` lab reference · `data/generated/` synthetic datasets + `data/generator/` script · `data/mappings/` · `data/processed/` (parquet, git-ignored) · `data/reports/` · `docs/` specs.

## Demo logins
`admin@prime.demo`/`admin123`, `engineer@prime.demo`/`engineer123`, personas `maya@`/`dev@`/`sam@`/`jordan@prime.demo` and Team leads `kasra@`/`carlos@prime.demo` (role `lead` = engineer + admin permissions) with `Prime!2026`. 2FA demo code `246810` (DEMO_MODE only).

## Extension points (Phase 3+)
- Front end: live data comes from `useSessionStream(sessionId)` → `useLive` store; add new WS event types there. API types: regenerate with `npm run gen:api` (backend running); hand-written types for free-form JSON live in `src/api/types.ts`.
- ML: register a function in `app.replay.manager.RUNNER_SETUP_HOOKS` that appends an async hook to `runner.checkpoint_hooks`; it is called with `(runner, db, checkpoint)` for every closed vision checkpoint inside the flush transaction.
- Adjustments: create the `adjustments` row, then `runner.queue_adjustment(param, value, adjustment_id, requested_at_layer)`; the runner applies it at the next layer start and publishes `adjustment`.

## Model facts (from docs/20)
Inputs in this order: `Flow` = speed × SLL_Width × SLL_Height · `Motor Power` = Duty × Voltage × Current · `Temperature (C)`. XGBoost → extrusion rate (RPM). RandomForest → interlayer delay class 1/5/10 (min). Load with `joblib.load`. One prediction per vision checkpoint (4 per layer).

## Commands
```bash
make up            # docker compose up --build (db, backend :8000, frontend :5173)
make seed          # seed users/printers/jobs/datasets (prints demo TOTP secrets); --reset via make reset-demo
make ingest        # CSVs in data/raw → data/processed/*.parquet via data/mappings/*.yaml
make reset-demo    # restore seeded state for a fresh demo run
make test          # backend pytest + frontend vitest
make models-report # regenerate ml/MODEL_REPORT.md
make generate-data # regenerate data/generated/* (deterministic)
```
Dev without Docker: `make local-setup`, then `make local-backend` and `make local-frontend` (needs Postgres 16 with user/db `prime`). Playwright's Chromium is preinstalled in the cloud sandbox; don't run `playwright install` there.

## Rules
- **Contracts first:** table/column names follow `11`, endpoints/payloads follow `12`. Deviations must be explained in your final message.
- **RBAC on every endpoint** via `require(permission)` from `core/rbac.py`; never check roles ad hoc. Front end shows locked buttons (lock icon + tooltip), not hidden ones.
- **Audit** every state-changing action (`core/audit.py`).
- **Determinism:** the demo scenario must produce identical results every run (seeded RNG, no wall-clock-dependent logic in the runner except tick pacing).
- **Provenance:** scenario-overridden values are stored with `source = scenario_override`; never delete raw model output (keep it in `features.raw_model_output`).
- **ML:** load pickles only from `ml_models/` with joblib; never retrain or modify them; feature order comes from `ml/model_config.yaml`. Keep scikit-learn 1.8.0 / xgboost 3.4.1 pinned (see `ml/MODEL_REPORT.md`).
- **Offline:** no runtime calls to external services or CDNs (fonts/icons bundled via npm).
- **UI:** colors only from `styles/tokens.css` (Milestone II palette); status always = color + icon + label; the ControlBar (Pause · Resume · Hold-to-STOP) is on every `/prints/:sessionId/*` page; plain-language copy, no lorem ipsum, no emoji.
- **Data:** canonical signals/units in docs/20 §2 (°C, RPM, V, A, %, W, mm/s, mm, mm³/s, min). Timestamps UTC in DB, America/Chicago in UI.
- **Secrets:** never commit `.env`, real passwords, or pickles larger than 50 MB (git-ignored; keep in `ml_models/`).
- Python: ruff + type hints, Pydantic v2 schemas, async SQLAlchemy. TS: strict, no `any` for API types (generated from OpenAPI).

## Workflow for every task
1. Read the specs, then the existing code you'll touch.
2. Implement with tests; run `make test` (and `make e2e` if UI flow changed).
3. For UI work, open the page in a browser at 1440×900 and 1024×768 and check it against Milestone II screens.
4. Final message: files changed, how to verify, deviations, open questions.

## Human-only
Providing CSVs/pickles + model semantics · approving `model_config.yaml` and `demo.yaml` · adding TOTP secrets to a phone · rehearsals + backup video.
