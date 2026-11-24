# PRIME — Milestone II (UI/UX Design): Master Plan

**Course:** CSC 4330 Software System Development (Fall 2026) · Dr. Nash Mahmoud
**Team:** Kasra Banijamali, Carlos Manosalvas
**Due:** Friday, Oct 16, 2026, 11:59 PM (CT)
**Product:** PRIME (Process Real-time Intelligence for Manufacturing Excellence), a real-time monitoring and AI process-control layer for concrete 3D printing (3DCP).

---

## 1. How to use this folder

This folder is a **spec pack for AI coding agents** (Claude Code / Cowork agents) plus a few human-only tasks.
Every agent should read `00_project_context.md` and `01_design_system.md` before doing anything else.
Agents then take a task from `09_agent_tasks.md`. Each task names the spec file it implements.

| File | Purpose | Deliverable page |
|---|---|---|
| `00_project_context.md` | Product, users, roles, user stories (US-01 to US-13), NFRs, mock data ranges | all |
| `01_design_system.md` | Color palette + justification, type, spacing, components, tokens | p.2 |
| `02_information_architecture.md` | Screen inventory, routes, sitemap, user-story traceability | p.3, 4–7 |
| `03_cover_page.md` | Logo redesign (vector) + cover layout | p.1 |
| `04_lofi_wireframes.md` | Paper sketch session (team photo) + digital lo-fi + route diagram | p.3 |
| `05_hifi_screens.md` | Pixel-level specs for every Hi-Fi screen | p.4–6 |
| `06_onboarding_gamification.md` | Onboarding flow, nudges, gamified features | p.7 |
| `07_user_journey_map.md` | Bonus journey map (+10) | p.8 |
| `08_build_and_export.md` | Repo layout, tech stack, rendering, Figma import, PDF assembly | — |
| `09_agent_tasks.md` | Ordered task list, agent prompts, acceptance criteria, QA checklist | — |

## 2. Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Hi-Fi tool | Agents build HTML/Tailwind screens → import into **Figma** with the html.to.design plugin (PNG fallback) | Rubric requires Figma/XD; HTML gives agents precise, reproducible, crisp output |
| Platforms | **Desktop 1440×900** (engineer / manager / admin) + **Tablet 1024×768 landscape** (operator on the print floor) | Matches the two real usage contexts from the user stories |
| Bonus | Include the detailed user journey map | +10 pts for about 2 hours of work |
| Logo | Rebuild as a **vector SVG** in the existing style | The current logo is an AI raster on a photo background; it risks the −20 "blurry graphics" penalty |

## 3. Final PDF structure (Letter, portrait unless noted)

| Page | Content | Points |
|---|---|---|
| 1 | Cover page: vector logo, title, team, course, "Milestone #2" | 10 |
| 2 | Color palette (swatches + hex + role) + justification | 10 |
| 3 | Lo-Fi wireframe: team photo with paper sketches + clean route/flow diagram | 30 |
| 4 | Hi-Fi: **Home** (Dashboard) + Login/MFA | 50 (shared) |
| 5 | Hi-Fi: **Core I**: Live Print Monitor (tablet) + Vision overlay | |
| 6 | Hi-Fi: **Core II**: AI Recommendation review, Trends, Session Report, Admin users | |
| 7 | Hi-Fi: **Onboarding** + **Cool features** (nudges, streaks, badges) | |
| 8 | Bonus: User journey map (landscape) | +10 |
| 9 | Figma link + contributions + use of AI (matches Milestone 1 format) | — |

**Penalty guards:** every image is exported at **2× device scale** (no screenshots of screenshots, no JPEG). Each Hi-Fi page holds **2–3 screens at most**, with captions and generous whitespace. See the QA checklist in `09_agent_tasks.md`.

## 4. Timeline (7 days)

| Day | Date | Work | Owner |
|---|---|---|---|
| Fri | Oct 9 | Approve plan; scaffold repo; agents build design tokens + component sheet | Kasra + agents |
| Sat | Oct 10 | **Paper lo-fi session + team photo** (human); agents build logo, cover, palette page, route diagram | Both + agents |
| Sun | Oct 11 | Agents build Hi-Fi batch A (Login, Dashboard, Live Monitor, Vision) | agents |
| Mon | Oct 12 | Agents build batch B (AI review, Trends, Alerts, Report, Admin) | agents |
| Tue | Oct 13 | Agents build batch C (Onboarding, Gamification, Nudges) + journey map | agents |
| Wed | Oct 14 | Render PNGs; import to Figma; team design review; fix list | Both |
| Thu | Oct 15 | Assemble PDF; QA checklist; contributions page | Both |
| Fri | Oct 16 | Buffer; submit before 11:59 PM | Both |

## 5. Human-only tasks (agents cannot do these)

1. Sketch the lo-fi screens on paper or a whiteboard together, then take the **team picture** with the sketches (see `04_lofi_wireframes.md`).
2. Run the html.to.design import into Figma and set the Figma file to "anyone with link can view".
3. Design review on Wednesday: both members sign off on every screen.
4. Write the final contributions + AI-use statement truthfully.
