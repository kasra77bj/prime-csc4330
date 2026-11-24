# 09 · Agent Task Breakdown, Prompts & QA

## How to run
- Put this folder at `prime-m2/plan/`. Run agents from `prime-m2/`.
- Phases run in order; tasks **inside** a phase can run in parallel (separate agents).
- Every agent prompt starts with the **standard preamble**:

> You are building design mockups (static HTML, not a working app) for PRIME, Milestone II of CSC 4330. Read `plan/00_project_context.md` and `plan/01_design_system.md` first, then the spec file named in your task. Use only tokens from `src/styles/tokens.css`, data from `src/data/mock.json`, Inter/JetBrains Mono, and inline Lucide SVG icons. Real copy only, no lorem ipsum. Every screen must fit its frame exactly (1440×900 desktop or 1024×768 tablet) with no scrollbars. After building, run `node scripts/render.mjs`, open your PNG(s) with an image viewer/Read tool, and fix anything clipped, misaligned, overlapping, or crowded. Finish by listing the files you created and any spec deviations.

## Phase 0 · Foundation (1 agent, sequential), Fri Oct 9
| ID | Task | Spec | Acceptance |
|---|---|---|---|
| T0.1 | Scaffold repo, `package.json`, Tailwind config, `tokens.css`, `render.mjs` | 08 §1–4 | `npm run render` produces a test PNG |
| T0.2 | Create `src/data/mock.json` with all values from 00 (current values, 2-hour time series at 10 s for each signal including the width dip at layer 39–43 and recovery after layer 43, alerts, AI recs, adjustment log, users, sessions) | 00 | Every number in 05/06 traces to this file |
| T0.3 | Build `src/lib/chart.js` (sparkline, line + band + limits + predicted dashed, timeline dots) | 01 §2 charts, 08 §1 | Outputs pure SVG; crisp at 2× |
| T0.4 | Build `src/components.html` component sheet | 01 §6 | **Human review gate:** both teammates approve before Phase 2 |

## Phase 1 · Brand & structure (parallel), Sat Oct 10
| ID | Task | Spec |
|---|---|---|
| T1.1 | Vector logo set + construction strip | 03 §1 |
| T1.2 | Report pages 1 (cover) and 2 (palette + justification) in `report.html` | 03 §2, 01 §2 |
| T1.3 | Digital lo-fi screens (7) + `flow.html` route diagram; also render the Mermaid diagram from 02 §3 to SVG as a backup | 04 B–C, 02 |
| H1 | **HUMAN:** paper sketch session + team photo | 04 A |

## Phase 2 · Hi-Fi screens (parallel batches), Sun–Tue
| ID | Screens | Spec | Device |
|---|---|---|---|
| T2.A | S01 Login, S02 MFA, S07 Dashboard | 05 | Desktop |
| T2.B | S08 Live Monitor (+ reconnecting variant + hold-to-stop variant), S09 Vision | 05 | Tablet |
| T2.C | S10 Trends, S11 AI Recommendations (+ manual drawer + operator-locked variant), S12 Alerts | 05 | Desktop |
| T2.D | S14 Session Report, S15 Admin Users (+ create modal) | 05 | Desktop |
| T2.E | S03 Welcome, S04 Role, S05 Tour step 4 (coach mark), S06 Connect printer, dashboard checklist widget | 06 A | Desktop + Tablet |
| T2.F | S16 Achievements, nudge toasts (6 variants on a cropped Live Monitor), quality-score ring close-up | 06 B–C | Desktop + Tablet |

Batch prompt template:
> [Standard preamble] Your task: **T2.B**. Build `src/screens/S08-live-monitor.html`, `S08b-live-reconnecting.html`, `S08c-hold-to-stop.html`, and `S09-vision.html` exactly per `plan/05_hifi_screens.md` sections S08 and S09. Reuse components from `src/components.html` (copy markup; don't invent new styles). The STOP button, control bar, and tile layout must match the component sheet exactly so all batches stay consistent.

## Phase 3 · Bonus + assembly, Tue–Wed
| ID | Task | Spec |
|---|---|---|
| T3.1 | Journey map (landscape) | 07 |
| T3.2 | Report pages 3–9 in `report.html` using exported PNGs; captions + ≤ 3 callouts per frame | README §3, 05 page table, 06 placement |
| T3.3 | **Consistency agent:** open every PNG; check same top bar, same control bar, same numbers for the same moment (e.g., width 36.4 mm at layer 42 everywhere), same names; write `exports/consistency-report.md` and fix issues | all |
| H2 | **HUMAN:** Figma import + color/text styles + prototype links + share link | 08 §6 |
| H3 | **HUMAN:** design review; create a fix list → hand to agents | — |

## Phase 4 · Final QA, Thu Oct 15 (1 verification agent + both humans)
### Rubric checklist
- [ ] P1 cover: new vector logo, title, team, professor, "Milestone #2", Fall 2026, Figma link
- [ ] P2 every color has hex + role + justification; contrast note
- [ ] P3 team photo + main screens + **routes with labeled arrows**
- [ ] P4 Home page Hi-Fi
- [ ] P5–6 core feature screens (live monitor, vision, AI review, trends, report)
- [ ] P7 onboarding screens + cool features (nudges + gamification)
- [ ] P8 journey map (bonus)
- [ ] Every user story US-01…US-13 appears in at least one caption (traceability)

### Penalty guards (−20 each)
**Blurry:**
- [ ] All screen images are PNG @2× from the renderer; none upscaled; no JPEG; no screenshots of PDFs
- [ ] Logo, diagrams, charts, icons are vector (SVG) wherever possible
- [ ] Zoom the final PDF to 200 %: text in every image is still sharp
- [ ] Team photo is in focus (pick the sharpest shot)

**Cluttered:**
- [ ] ≤ 3 frames per page; ≥ 0.3 in whitespace between frames
- [ ] Each screen: ≤ 1 primary button per region, ≤ 2 status colors visible in the normal state
- [ ] Captions ≤ 2 lines; callouts ≤ 3 per frame
- [ ] Body text ≥ 9 pt at print size; no overlapping elements
- [ ] Anything that doesn't fit moves to an appendix page instead of shrinking

### Verification agent prompt
> Read `plan/09_agent_tasks.md` Phase 4. Open `exports/PRIME_Milestone2.pdf` page by page as images, plus every `exports/*@2x.png`. For each checklist item, mark pass/fail with evidence (page number, what you saw). Measure image effective DPI in the PDF. List concrete fixes ranked by rubric points at risk. Do not edit files.
