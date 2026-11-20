# 16 · Front End (React + Vite + TS)

Visual source of truth: Milestone II `01_design_system.md` (tokens) and `05_hifi_screens.md` / `06_onboarding_gamification.md` (screen specs). The Hi-Fi HTML from Milestone II may be reused as markup reference: port it into components, don't screenshot-match by hand.

## 1. Structure
```
frontend/src/
├─ main.tsx, App.tsx, router.tsx
├─ styles/tokens.css, index.css            ← tokens copied from Milestone II
├─ api/client.ts                           ← fetch wrapper, auth header, 401 → refresh → retry
├─ api/hooks/*.ts                          ← TanStack Query hooks per resource
├─ ws/socket.ts                            ← single WebSocket, subscribe(channel), last_seq resume, backoff
├─ ws/useSessionStream.ts                  ← feeds store from events
├─ store/session.ts (zustand)              ← live values, ring buffers (last 30 min @1 Hz), alerts, pending rec
├─ store/auth.ts                           ← user, role, permissions
├─ auth/permissions.ts, RequireRole.tsx, LockedButton.tsx
├─ components/                             ← MetricTile, StatusPill, ControlBar, HoldToStopButton, AlertBanner,
│                                            AiRecommendationCard, ConnectionPill, RoleBadge, CoachMark, NudgeToast,
│                                            Badge, Sparkline, TrendChart, PredictionMiniChart, DataTable, Modal, Drawer
├─ layouts/AppShell.tsx (sidebar+topbar), PrintLayout.tsx (tabs + persistent ControlBar), TabletShell.tsx
└─ pages/ (one folder per route below)
```

## 2. Routes → pages → data
| Route | Page (Milestone II ID) | Roles | Data |
|---|---|---|---|
| `/login`, `/login/verify`, `/login/enroll` | Login, MFA (S01–S02) | public | `/auth/*` |
| `/onboarding/welcome` · `/role` · `/tour` · `/printer` | Onboarding (S03–S06) | first login | `/me`, `PATCH /me/onboarding`, `/printers/{id}/sensors` |
| `/dashboard` | Dashboard (S07) | all | `/dashboard/summary`, `/printers`, `ws site:<id>` |
| `/prints/:sessionId/live` | Live Monitor (S08) | all | `/sessions/{id}`, `ws session:<id>` |
| `/prints/:sessionId/vision` | Vision (S09) | all | `/layers/{n}/frame` |
| `/prints/:sessionId/trends` | Trends (S10) | all | `/readings?bucket=`, `/predictions` |
| `/prints/:sessionId/ai` | AI Recommendations (S11) | all (actions E) | `/recommendations`, `/adjustments` |
| `/alerts` | Alerts center (S12) | all | `/alerts` |
| `/sessions`, `/sessions/:id/report` | Sessions, Report (S13–S14) | E, M, A | `/sessions`, `/report`, exports |
| `/admin/users`, `/admin/audit` | Admin (S15) | A | `/users` |
| `/me/achievements` | Achievements (S16) | O, E | `/me/achievements` |
| `/settings` | Settings (S17) | all | `/me` |
| `/demo` | Demo control panel (hidden, not in nav) | A + DEMO_MODE | `/demo/*` |

**Note:** Milestone II routes used `:jobId`; the implementation uses `:sessionId` (a job can be printed more than once). Mention this in the final report.

## 3. Live behavior
- **ControlBar** lives in `PrintLayout`, so it's present on all four print tabs (US-07). Pause/Resume call the API immediately (optimistic UI, revert on error). **HoldToStopButton** = 1.5 s press-and-hold (pointer + keyboard Space hold), ring progress, then `POST /stop`.
- **MetricTile** subscribes to one signal from the store; shows value, unit, normal range, 60-min sparkline, status pill derived from limits + open alerts.
- **AlertBanner** shows the highest-severity open alert of the current session; global critical alerts also appear on every route.
- **ConnectionPill** states from `socket.ts`: `live` / `reconnecting (n buffered)` / `offline`. After reconnect, a toast: "Reconnected, no data lost (37 readings recovered)".
- **Nudges:** `NudgeQueue` (max 1 visible, 8 s) fed by WS `notification` events and local rules (e.g., unacknowledged warning > 30 s).
- **Role locks:** operators see AI cards with `LockedButton` + "Escalate" instead of Accept/Modify/Reject.
- Tablet layout (1024 px) for `/prints/*` when viewport < 1200 px: bottom tabs, larger tiles, 56–64 px targets.

## 4. Charts (Recharts)
- Colors only from tokens: measured `#1C1E21`, second series `#3C665E`, **AI prediction `#7E57A6` dashed**, target band `#E6EEF4`, limits `#C62828` dashed, warning zone `#B7791F` at 15 %.
- Trends: signal checklist + time window chips (5 m, 15 m, 1 h, whole print, custom) → `bucket` param chosen so ≤ 600 points.
- Disable animations on live charts; append points from the store, no full refetch.

## 5. Report page & PDF
`/sessions/:id/report` has a print stylesheet (`@media print`, Letter): hides nav, keeps KPIs, charts, tables, summary. "Export ▾ PDF" calls `window.print()`; CSV/JSON download from the API.

## 6. Quality bar
TypeScript strict, ESLint, no `any` in API types (generate from OpenAPI with `openapi-typescript` into `src/api/types.ts`). Every page handles loading, empty, and error states. Accessible: focus rings, aria-labels on icon buttons, color never alone.
