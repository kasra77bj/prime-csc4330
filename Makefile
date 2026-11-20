# PRIME developer commands. Docker targets work on Windows via Git Bash / WSL;
# the `local-*` targets run without Docker (needs Python 3.12, Node 22, Postgres 16).
.PHONY: up down build logs seed reset-demo ingest test test-backend test-frontend models-report generate-data \
        local-setup local-backend local-frontend

up:            ; docker compose up --build -d && docker compose logs -f backend
down:          ; docker compose down
build:         ; docker compose build
logs:          ; docker compose logs -f
seed:          ; docker compose exec backend python -m app.seed.seed
reset-demo:    ; docker compose exec backend python -m app.seed.seed --reset
ingest:        ; docker compose exec backend python -m app.replay.source_csv ingest-all

test: test-backend test-frontend
test-backend:  ; cd backend && .venv/bin/pytest -q
test-frontend: ; cd frontend && npm test

models-report: ; backend/.venv/bin/python ml/inspect_models.py
generate-data: ; backend/.venv/bin/python data/generator/generate_datasets.py ml_models data/generated

local-setup:
	cd backend && python3.12 -m venv .venv && .venv/bin/pip install -e ".[dev]"
	cd frontend && npm ci
local-backend:  ; cd backend && .venv/bin/alembic upgrade head && .venv/bin/python -m app.seed.seed && .venv/bin/uvicorn app.main:app --reload --port 8000
local-frontend: ; cd frontend && npm run dev
