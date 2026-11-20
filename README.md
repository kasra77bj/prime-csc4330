# PRIME: Process Real-time Intelligence for Manufacturing Excellence

CSC 4330 Software System Development · Fall 2026 · Kasra Banijamali & Carlos Manosalvas

Real-time monitoring and AI process control for concrete 3D printing. The demo replays recorded/synthesized print data, runs the team's **XGBoost (extrusion rate)** and **Random Forest (interlayer delay)** models per layer checkpoint, raises alerts, and lets engineers accept/modify/reject AI adjustments.

## Quick start on Windows (Docker Desktop)
1. Install **Docker Desktop** (enable WSL 2 when asked) and restart.
2. Make sure `ml_models\` contains the six `.pkl` files and `raw_data\raw.xlsx` exists.
3. In PowerShell, from this folder:
   ```powershell
   copy .env.example .env
   docker compose up --build
   ```
   First build takes a few minutes and needs internet; after that it runs offline.
4. Open **http://localhost:5173** (app) and **http://localhost:8000/docs** (API).
5. Reset demo data any time: `docker compose exec backend python -m app.seed.seed --reset`

### Demo logins
2-factor code for every demo account: **246810** (works only while `DEMO_MODE=true`; real TOTP secrets are printed in the backend log on first seed).

| Role | Email | Password |
|---|---|---|
| Admin | `admin@prime.demo` | `admin123` |
| Engineer | `engineer@prime.demo` | `engineer123` |
| Operator (persona) | `maya@prime.demo` | `Prime!2026` |
| Manager (persona) | `jordan@prime.demo` | `Prime!2026` |

API docs with a "Try it out" button: http://localhost:8000/docs. Demo controls (Admin): `POST /api/v1/demo/reset`, `/demo/sessions/{id}/speed`, `/jump`, `/trigger`, `/disconnect`.

## Where things are
| Path | What |
|---|---|
| `docs/` | Specs. Start with `20_data_and_models.md`, then `19_agent_tasks.md` for the task list and status |
| `CLAUDE.md` | Instructions for coding agents |
| `backend/` | FastAPI + SQLAlchemy + Alembic (`app/models` = database schema) |
| `frontend/` | React + Vite + Tailwind (team palette in `src/styles/tokens.css`) |
| `ml_models/` | The team's pickles (not in git) |
| `ml/` | `MODEL_REPORT.md`, `model_config.yaml`, `inspect_models.py` |
| `data/generated/` | Demo/trial datasets (+ `data/generator/generate_datasets.py`) |
| `data/reports/` | Per-dataset value summaries |

## Status
Phase 0 (foundation) and Phase 1 (backend core: login + 2FA, roles, live replay engine, WebSocket stream, alerts, escalation) done Nov 20, 2026. Next: Phase 2 (ML models in the loop + front-end shell). See `docs/19_agent_tasks.md`.
