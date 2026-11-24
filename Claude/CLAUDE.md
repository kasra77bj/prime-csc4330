# CLAUDE.md · PRIME Milestone II (UI/UX Design)

CSC 4330 Software System Development, Fall 2026 · Team: Kasra Banijamali, Carlos Manosalvas · **Due Fri Oct 16, 2026, 11:59 PM CT**

PRIME is a real-time monitoring + AI process-control layer for concrete 3D printing. This repo produces **design mockups, not a working app**: static HTML screens rendered to crisp PNGs, imported into Figma, and assembled into a 9-page Letter PDF.

## Read before any task
1. `plan/00_project_context.md`: roles, user stories US-01…US-13, mock data values
2. `plan/01_design_system.md`: palette, type, components, tokens (**source of truth for all styling**)
3. The spec file named in your task (see `plan/09_agent_tasks.md` for the task list)

| Spec | Covers |
|---|---|
| `plan/02_information_architecture.md` | Screen IDs (S01–S17), routes, flows |
| `plan/03_cover_page.md` | Vector logo + cover (p.1) |
| `plan/04_lofi_wireframes.md` | Lo-fi screens + route diagram (p.3) |
| `plan/05_hifi_screens.md` | Hi-Fi screen specs (p.4–6) |
| `plan/06_onboarding_gamification.md` | Onboarding, nudges, gamification (p.7) |
| `plan/07_user_journey_map.md` | Bonus journey map (p.8) |
| `plan/08_build_and_export.md` | Stack, repo layout, render script, Figma import |

## Commands
```bash
npm install
npm run css       # build Tailwind from src/styles → src/styles/app.css
npm run render    # node scripts/render.mjs → exports/*@2x.png + exports/PRIME_Milestone2.pdf
```
These scripts are created in task T0.1. Playwright's Chromium is preinstalled; never run `playwright install`.

## Repo layout
`plan/` specs (read-only) · `assets/logo/` SVG logos · `src/styles/tokens.css` · `src/data/mock.json` · `src/lib/chart.js` · `src/components.html` · `src/lofi/` · `src/screens/` · `src/journey/` · `src/report/report.html` · `scripts/render.mjs` · `exports/`

## Palette quick reference (full rules in `plan/01_design_system.md`)
| Token | Hex | Use |
|---|---|---|
| canvas / surface / border | #F5F4F1 / #FFFFFF / #DCD9D3 | Background / cards / dividers (non-text) |
| text / text-muted | #1C1E21 / #5F6368 | Primary / secondary text |
| charcoal | #23272B | Sidebar, tablet top bar, coach marks, toasts |
| brand-600 / brand-700 / brand-50 | #1F5F8B / #174A6D / #E6EEF4 | Actions only / hover + headings / selection + AI cards |
| critical / critical-50 | #C62828 / #FDECEA | Critical alerts, STOP button |
| ok / ok-50 | #2E7D32 / #E8F5E9 | In range, success, badges |
| viz-teal / viz-violet / viz-ochre | #3C665E / #7E57A6 / #B7791F | Charts only; violet = AI prediction; ochre also = warning accent |
| warn-50 | #FBF3E4 | Warning banner/tile background (derived; pending team approval) |

## Non-negotiable rules
- **Only use tokens** from `src/styles/tokens.css`. Never invent hex codes. Blue is for interactive elements only.
- **Never color alone:** every status = color + Lucide icon + text label. Ochre is never used for text.
- **Calm by default:** normal state is neutral; color appears only for warning/critical. ≤ 2 status colors visible in a normal-state screen.
- **Safety controls:** on every `/prints/:jobId/*` screen, the bottom control bar (Pause · Resume · Hold-to-STOP) is identical and always visible.
- **Frames:** desktop 1440×900, tablet 1024×768 (`<body data-frame="desktop|tablet">`). Content fits exactly, no scrollbars.
- **Data:** every number comes from `src/data/mock.json`; the same moment shows the same values everywhere (e.g., layer 42, width 36.4 mm). People: Maya Ortiz (Operator), Dev Patel (Engineer), Sam Lee (Admin), Jordan Brooks (Manager). No real company names.
- **Copy:** real, plain-language text; no lorem ipsum; no emoji in the UI.
- **Fonts/icons/charts:** Inter + JetBrains Mono; inline Lucide SVG; charts as **inline SVG** via `src/lib/chart.js` (no canvas charts, which rasterize in Figma).
- **Reuse components** from `src/components.html` (copy markup); don't create new styles per screen.
- Header comment on every screen: `<!-- S08 · Live Print Monitor · /prints/:jobId/live · US-03,04,06,07 -->`.

## Grading penalties to avoid (−20 each)
- **Blurry:** PNGs only at `deviceScaleFactor: 2`; never upscale; no JPEG; logo/diagrams/icons as SVG; zoom PDF to 200 % to verify.
- **Cluttered:** ≤ 3 frames per report page, ≤ 3 callouts per frame, captions ≤ 2 lines, body text ≥ 9 pt. If it doesn't fit, move it to an appendix; don't shrink it.

## Workflow for every task
1. Read the specs above, then build.
2. Run `npm run render` and **look at your PNGs** (Read the image). Fix clipping, overlap, misalignment, crowding.
3. Report: files created/changed, and any deviation from the spec with the reason.
4. Don't edit files in `plan/` unless explicitly asked; flag spec problems instead.

## Human-only steps (don't attempt)
Paper lo-fi sketch session + team photo · Figma import (html.to.design) + prototype links + share link · design review sign-off · contributions/AI-use statement.
