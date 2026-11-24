# PRIME — Working System & Final Demo: Master Plan

**Course:** CSC 4330 Software System Development (Fall 2026) · Dr. Nash Mahmoud
**Team:** Kasra Banijamali, Carlos Manosalvas
**Demo:** about 2 weeks out (**target Thu Dec 3, 2026**, buffer Fri Dec 4) · runs on Kasra's laptop
**Continues:** Milestone II plan files `00`–`09` (product context, design system, screens). This pack adds `10`–`19`.

---

## 1. What we are building
A working PRIME web app that, during the demo, **replays real sensor data from previous prints**, runs the team's **XGBoost (extrusion rate)** and **Random Forest (interlayer delay)** models on it live, raises alerts, proposes adjustments that an engineer accepts/modifies/rejects, and ends with a generated report and data export. Every user story US-01…US-13 must be demonstrable.

## 2. Decisions
| Area | Decision |
|---|---|
| Front end | React 18 + Vite + TypeScript + Tailwind (tokens from `01_design_system.md`) + TanStack Query + Zustand + Recharts |
| Back end | Python 3.11 + FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2, WebSockets for live data |
| Database | PostgreSQL 16 |
| ML | Team's pickles: XGBoost → extrusion rate, Random Forest → interlayer delay. Loaded once at startup behind a common `PredictorAdapter` interface. SHAP TreeExplainer for "why" text. |
| Data source | **Replay engine** fed by the team's CSV logs from previous prints, plus a **scenario file** that pins (hardcodes) values at chosen layers so the demo story happens on cue, every time |
| Auth | Password (argon2) + TOTP 2FA (pyotp), JWT access token + httpOnly refresh cookie, role-based access (Operator / Engineer / Administrator / Manager) |
| Run | `docker compose up` (Postgres + backend + frontend) on the laptop; no internet needed during the demo |

## 3. Files in this pack
| File | Purpose |
|---|---|
| `10_architecture.md` | System diagram, repo layout, services, env vars, Docker Compose |
| `11_data_model.md` | ERD, every table + relationships, enums, indexes, seed data |
| `12_api_spec.md` | REST endpoints (with role permissions) + WebSocket protocol |
| `13_auth_rbac.md` | Login, 2FA, tokens, permission matrix |
| `14_data_ingest_and_replay.md` | CSV data contract, ingest, replay engine, **demo scenario + hardcoded overrides** |
| `15_ml_integration.md` | Pickle inspection, feature config, inference pipeline, recommendations, explanations, confidence |
| `16_frontend.md` | Routes → pages/components, state, WebSocket client, charts, mapping to Milestone II screens |
| `17_feature_logic.md` | Alert engine, print control state machine, escalation, reports/export, gamification, nudges, onboarding |
| `18_testing_and_demo.md` | Test plan, **minute-by-minute demo script**, rehearsal + fallback plan |
| `19_agent_tasks.md` | Ordered task list with agent prompts and acceptance criteria |
| `CLAUDE.md` | Repo-root instructions every coding agent reads automatically |

## 4. Timeline (Thanksgiving is Thu Nov 26)
| Dates | Phase | Outcome |
|---|---|---|
| Fri Nov 20 – Sat Nov 21 | **P0 Foundation** | Repo, Docker, DB schema + migrations, seed; **Kasra delivers CSVs + pickles + training versions**; pickle inspection report |
| Sun Nov 22 – Tue Nov 24 | **P1 Backend core** | Auth/2FA/RBAC, CRUD, ingest, replay engine, WebSocket stream, alert engine |
| Mon Nov 23 – Wed Nov 25 | **P2 ML + shell** | Model service, recommendations, adjustments; front-end shell, login, dashboard, live monitor |
| Thu Nov 26 – Fri Nov 27 | Holiday buffer | Agents can keep working on queued tasks; humans review only |
| Sat Nov 28 – Mon Nov 30 | **P3 Features** | Vision, trends, AI review, alerts, reports/export, admin, onboarding, gamification |
| Tue Dec 1 – Wed Dec 2 | **P4 Hardening** | Demo scenario tuned, e2e tests, full rehearsals ×3, backup video recorded |
| Thu Dec 3 | **Demo** | — |

## 5. Inputs needed from Kasra (blocking P0)
1. **Sensor CSVs** from 2–3 previous prints (any column names; we map them, see `14`). At least one long print for the main demo.
2. **Pickle files:** `extrusion_xgb.pkl`, `interlayer_rf.pkl` (any names).
3. For each model: **target meaning + unit** (e.g., "pump RPM needed to hit target width"), **input feature list and order**, and the **Python, scikit-learn, and xgboost versions used to train them** (pickles often fail to load on different versions).
4. Optional: camera frames (JPG/PNG) per layer for the Vision screen; otherwise we use 6–8 representative images.
5. Which moments to hardcode for the demo story (default story in `14` §5).

## 6. Human-only tasks
- Provide inputs above; confirm model semantics after the inspection report (T0.4).
- Approve the demo scenario (T4.1).
- Add the seeded demo users' 2FA secrets to an authenticator app on your phone before rehearsal.
- Rehearse the demo three times; record the backup video.
