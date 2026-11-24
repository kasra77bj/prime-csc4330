# 00 · Project Context (read first)

> **Update (Nov 20, 2026):** real model inputs, units, value ranges and the demo story are now defined in [`20_data_and_models.md`](20_data_and_models.md). Where they differ, **doc 20 wins**.

## Product in one paragraph
PRIME is a **retrofit sensing and prediction layer** for concrete 3D printers (robotic-arm or gantry). It fuses live **temperature**, **pump/motor power**, and **camera-derived layer geometry** (bead width/height) into AI predictions of **extrusion rate (pump RPM)** and **interlayer delay**. It shows operators what is happening now and gives engineers concrete, explainable adjustment recommendations so a print can be corrected *while it is still correctable*.

Tagline (from logo): **"AI-Powered Concrete 3D Printing Platform"**

## Users and roles (RBAC, from NFR #1)
| Role | Who | Main device | Can do | Cannot do |
|---|---|---|---|---|
| **Operator** (material / quality operator) | Print-floor technician | Tablet 1024×768, gloves possible | View live dashboard, camera, graphs; pause/resume/stop; acknowledge alerts; escalate to engineer | See raw sensor dumps, change AI/model settings, apply parameter changes |
| **Engineer** | Process / quality engineer | Desktop 1440 | Everything Operator can + review AI recommendations (accept/modify/reject), manual RPM/speed adjustment, raw data | User management |
| **Administrator** | IT / site lead | Desktop | Create users, assign roles, printer setup | — |
| **Manager** | Project / ops manager (read-only role in UI; treated as Engineer-viewer) | Desktop | Session history, summary reports, export | Live control |

## User stories (traceability IDs used everywhere)
| ID | Short name | Role | Screen(s) |
|---|---|---|---|
| US-01 | Login + 2FA | All | Login, MFA |
| US-02 | Create users, assign roles | Admin | Admin › Users |
| US-03 | Live temperature | Operator | Live Monitor |
| US-04 | Live print speed + nozzle size | Operator | Live Monitor |
| US-05 | Camera with layer width/height overlay | Quality Operator | Vision |
| US-06 | Out-of-range alert | Operator | Live Monitor, Alerts, global banner |
| US-07 | Pause / resume / stop always reachable | Operator | Persistent control bar on every print screen |
| US-08 | Graph any value over chosen window | Operator | Trends |
| US-09 | AI proposes RPM/speed change with reason + predicted effect | Engineer | AI Recommendations |
| US-10 | Accept / modify / reject AI recommendation | Engineer | AI Recommendations |
| US-11 | Manual adjustment logged as independent decision | Engineer | Manual Adjust drawer, Audit log |
| US-12 | Download session data (CSV/JSON) | Manager | Session Report › Export |
| US-13 | Generated summary report | Manager | Session Report |

## Non-functional requirements that drive the UI
1. **Security:** MFA step, role badge always visible in the top bar, locked/disabled states for actions a role cannot perform (show lock icon + tooltip "Engineer approval required").
2. **Usability = safety:** PAUSE / RESUME / STOP are in a **persistent bottom control bar**, at least 64 px tall touch targets on tablet, never hidden by scroll or modals. Plain-language labels, no jargon without a tooltip.
3. **Reliability:** a visible **connection status pill** (Live · Reconnecting · Offline, buffered N readings) and a "data preserved" message after reconnect.

## Realistic mock data (use consistently across all screens)
Use the shared file `src/data/mock.json` (see `08_build_and_export.md`). Canonical values:

| Signal | Unit | Normal range | Example "now" value | Alert example |
|---|---|---|---|---|
| Material temperature | °C | 18 – 30 | 24.6 | 31.2 (high) |
| Ambient temperature | °C | 10 – 35 | 27.1 | — |
| Pump motor speed | RPM | 180 – 320 | 246 | — |
| Pump motor power | kW | 1.2 – 2.8 | 1.9 | 2.95 (spike) |
| Print (nozzle) speed | mm/s | 60 – 140 | 100 | — |
| Nozzle diameter | mm | fixed per job | 30 | — |
| Layer width (measured) | mm | target 40 ± 3 | 38.1 | 36.4 (−9 %, warn) |
| Layer height (measured) | mm | target 15 ± 1.5 | 14.8 | — |
| Interlayer delay | s | 60 – 240 | 132 | predicted 228 in ~6 layers (approaching 240 limit) |
| AI confidence | % | — | 87 % | — |

**Demo print job:** `Job #A-1027 · "Wall Panel WP-03" · Printer: Gantry-02 (Bay 2) · Layer 42 / 120 · Elapsed 01:12:40 · ETA 02:05:00`
**People (fictional, use only these):** Operator *Maya Ortiz*, Engineer *Dev Patel*, Admin *Sam Lee*, Manager *Jordan Brooks*. (Do not use real company names in UI.)
