# 12 · API Specification

Base: `http://localhost:8000/api/v1` · JSON · Auth: `Authorization: Bearer <access>` (refresh in httpOnly cookie) · OpenAPI at `/docs`.
Role codes: **O** operator · **E** engineer · **A** admin · **M** manager · **all** = any signed-in user.

## 1. Auth (US-01)
| Method | Path | Roles | Body → Response |
|---|---|---|---|
| POST | `/auth/login` | public | `{email,password,remember_device}` → `{mfa_required:true, mfa_token}` or, if device remembered, tokens |
| POST | `/auth/mfa/verify` | mfa_token | `{mfa_token, code}` → `{access_token, user}` + refresh cookie |
| POST | `/auth/mfa/enroll` | self (not enrolled) | → `{otpauth_uri, qr_svg}` |
| POST | `/auth/mfa/enroll/confirm` | self | `{code}` → `{ok}` |
| POST | `/auth/refresh` | cookie | → `{access_token}` |
| POST | `/auth/logout` | all | revokes refresh token |
| GET | `/me` | all | profile, role, site access, onboarding progress |

## 2. Users & admin (US-02)
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/users` | A | list, filter `role`, `q` |
| POST | `/users` | A | `{full_name,email,role,site_ids}` → user + temporary password (shown once); MFA enrollment forced on first login |
| PATCH | `/users/{id}` | A | role, active, sites |
| GET | `/sites` | all | |

## 3. Printers, jobs, sessions
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/printers` | all | with live status: active session, current values, sensor statuses |
| GET | `/printers/{id}/sensors` | all | onboarding checklist |
| POST | `/printers/{id}/sensors/test` | E, A | runs 30-s sensor test (replays 30 rows) → result per sensor |
| GET/POST | `/jobs` | all / E | |
| GET | `/sessions` | all | filters `status`, `printer_id`, `from`, `to` (Sessions history) |
| POST | `/sessions` | E | `{job_id, printer_id, dataset_id, scenario_name?}` → `scheduled` |
| GET | `/sessions/{id}` | all | header data, current state, limits, latest values |
| POST | `/sessions/{id}/start` | O, E | `scheduled`→`running`; starts the SessionRunner |
| POST | `/sessions/{id}/pause` | O, E | US-07 |
| POST | `/sessions/{id}/resume` | O, E | US-07 |
| POST | `/sessions/{id}/stop` | O, E | US-07; body `{reason}`; must respond < 300 ms |

## 4. Live data & history
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/sessions/{id}/readings` | all | `?signals=layer_width,pump_rpm&from=&to=&bucket=10s` → downsampled series for Trends (US-08). Operators get aggregated data only; `?raw=true` requires E |
| GET | `/sessions/{id}/layers` | all | per-layer measurements |
| GET | `/sessions/{id}/layers/{n}/frame` | all | image + overlay measurements (US-05) |
| POST | `/frames/{id}/flag-artifact` | O, E | US-05 |

## 5. AI
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/sessions/{id}/predictions` | all | `?target=&from_layer=` (charts' violet line) |
| GET | `/sessions/{id}/recommendations` | all | `?status=pending` (O sees read-only) |
| POST | `/recommendations/{id}/accept` | E | → creates `adjustment(ai_accepted)` (US-10) |
| POST | `/recommendations/{id}/modify` | E | `{final_value, note?}` → `adjustment(ai_modified)`; value validated against printer limits |
| POST | `/recommendations/{id}/reject` | E | `{reason, note?}` |
| POST | `/sessions/{id}/adjustments` | E | **manual**: `{parameter, to_value, note}` → `adjustment(manual)` (US-11) |
| GET | `/sessions/{id}/adjustments` | all | audit trail table |
| GET | `/models` | E, A | active model versions, features, metrics |

## 6. Alerts & escalation (US-06)
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/alerts` | all | `?status=open&session_id=` |
| POST | `/alerts/{id}/acknowledge` | O, E | |
| POST | `/alerts/{id}/resolve` | E | (auto-resolve also happens) |
| POST | `/sessions/{id}/escalate` | O | `{alert_id?, message?}` → notifies on-duty engineer; returns `{engineer, typical_response_s}` |

## 7. Reports & export (US-12, US-13)
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/sessions/{id}/report` | E, M | (re)generate report |
| GET | `/sessions/{id}/report` | E, M | KPIs, charts data, summary text |
| GET | `/sessions/{id}/export.csv` | E, M | readings + predictions + adjustments (zip of 3 CSVs) |
| GET | `/sessions/{id}/export.json` | E, M | full session bundle |
| — | PDF | E, M | front end renders print-optimized report page → browser "Save as PDF" (no server PDF lib needed) |

## 8. Me, gamification, notifications
`GET /me/achievements` (badges + progress, shift summary) · `GET /me/notifications` · `POST /me/notifications/{id}/read` · `PATCH /me/onboarding` · `GET /shift-goals/current` · `GET /dashboard/summary` (KPI cards: active prints, open alerts, pending AI, shift quality score).

## 9. Demo controls (only when `DEMO_MODE=true`, role A)
`POST /demo/reset` (restore DB to seeded state, ≤ 5 s) · `POST /demo/sessions/{id}/speed {multiplier}` · `POST /demo/sessions/{id}/jump {layer}` · `POST /demo/sessions/{id}/trigger {event}` (e.g., `width_dip`, `sensor_drop`, `temp_spike`) · `POST /demo/sessions/{id}/disconnect {seconds}` (simulate network drop for the reliability demo).

## 10. WebSocket protocol
`ws://localhost:8000/ws?token=<access>` · client sends `{"type":"subscribe","channel":"session:<id>","last_seq":1234}` or `"channel":"site:<id>"` (dashboard).
Server → client envelope: `{ "seq": 1235, "type": "...", "session_id": "...", "ts": "...", "data": {...} }`

| type | data |
|---|---|
| `reading` | all signal values + `layer` + `source` |
| `layer_completed` | layer row |
| `prediction` | target, value, interval, confidence, horizon |
| `recommendation` | full recommendation object (or status change) |
| `adjustment` | adjustment row + `applies_at_layer` |
| `alert` | alert object (opened / updated / acknowledged / resolved) |
| `control` | new session status + who |
| `notification` | for the subscribing user |
| `connection` | `{state:"live"|"degraded", buffered:n}` |
| `heartbeat` | every 5 s |

**Reliability (NFR 3):** server keeps the last 2,000 events per session in memory; on reconnect the client sends `last_seq` and receives the missed events (then live). If the gap is larger, the client refetches via REST. Readings are persisted before broadcast, so nothing is lost.
