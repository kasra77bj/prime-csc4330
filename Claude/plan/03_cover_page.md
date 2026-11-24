# 03 · Cover Page & Logo (page 1, 10 pts)

## 1. Logo redesign (vector)
**Problem with the Milestone 1 logo:** it is an AI-generated raster sitting on a blurred photo inside a circle. Text "AI-POWERED CONCRETE 3D PRINTING PLATFORM" is tiny and soft. At print size it risks the **−20 blurry graphics** penalty, and it can't be used as an app icon.

**Redesign goal:** keep the recognizable concept (a "P" built from layered extrusion/circuit traces with a rising arrow) but rebuild it as **clean SVG**.

### Spec for the agent
- Output: `assets/logo/prime-mark.svg` (symbol only), `prime-logo-horizontal.svg` (mark + wordmark), `prime-logo-stacked.svg` (mark above wordmark + tagline), `prime-favicon.svg` (32 px simplified).
- **Mark:** a bold "P" made of **3 parallel stroked paths** (like stacked concrete beads / circuit traces), stroke width equal, rounded caps, colors left→right `#0B2A45`, `#1E5FA8`, `#2FA36B`. Two traces end in small circular nodes (circuit pads). An arrow rises from the P's bowl to the upper right in `#2FA36B`.
- **Wordmark:** "PRIME" in Montserrat 800, letter-spacing 0.04em, `#1B2430`. Convert text to outlines (paths) so it renders identically everywhere.
- **Tagline:** "AI-POWERED CONCRETE 3D PRINTING PLATFORM", Inter 600, 0.12em tracking, `#5B6573`, only in the stacked version and at ≥ 10 pt.
- Must read clearly at 24 px (favicon test) and in one color (all `#0B2A45`).
- No photo background, no gradients, no drop shadows.
- Deliver a small **logo-construction strip** (optional, nice touch): mark on grid, one-color version, app-icon version on navy rounded square.

> Human check: compare against the old logo side by side; both teammates approve before cover is built.

## 2. Cover layout (Letter 8.5×11 in, HTML page rendered to PDF)
```
┌───────────────────────────────────────┐
│ [navy top band 16px]                  │
│                                       │
│        [PRIME stacked logo, 3.2 in]   │
│                                       │
│   PRIME: Process Real-time Intelligence│
│      for Manufacturing Excellence      │  Inter 32/700, navy-900
│                                       │
│   Milestone II: UI/UX Design          │  Inter 20/500, blue-600
│                                       │
│   [subtle hero: 1 Hi-Fi tablet mockup │  optional, ~40% width, crisp PNG@2x
│    of Live Monitor, angled shadow]    │
│                                       │
│ Team: Kasra Banijamali · Carlos Manosalvas
│ Professor: Dr. Nash Mahmoud           │
│ CSC 4330 – Milestone #2 · Fall 2026   │  Inter 12, gray-600
│ [thin green-brand rule]  Figma: <link>│
└───────────────────────────────────────┘
```
- Keep it airy: max 6 text elements + logo + optional mockup.
- Same title text as Milestone 1 for continuity; change "Milestone #1" → "Milestone #2".
- Acceptance: rendered at 300 dpi equivalent (Playwright PDF is vector for text/SVG), no raster except the optional mockup PNG at 2×.
