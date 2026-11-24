# 04 · Lo-Fi Wireframes (page 3, 30 pts)

Rubric: *show the main screens* + *show the routes*; a *team picture is recommended*.
Plan: **two layers on one page**: (A) a real team photo with paper sketches (authentic, earns the "team picture" credit), and (B) a clean digital route diagram so the routes are readable (avoids "blurry" and "cluttered").

## A. Paper sketch session (HUMAN, ~90 min, Saturday Oct 10)
**Materials:** whiteboard or 6 sheets of A4/Letter, black + one blue marker, sticky notes, phone camera.

**Sketch these 7 main screens** (one sheet each, grayscale boxes, no colors, use the layouts in section C as the guide):
1. Login + MFA (one sheet, two small frames)
2. Home / Dashboard
3. Live Print Monitor (tablet)
4. Vision overlay (tablet)
5. Trends
6. AI Recommendations
7. Session Report

**Routes:** lay the sheets on a table/whiteboard in the flow order from `02_information_architecture.md` and **draw arrows between them with the blue marker** (or yarn/tape). Label each arrow with the trigger ("tap alert", "Accept", "Export").

**Photo:** both teammates in the frame, pointing at the sketches. Shoot in daylight, landscape, phone at ≥ 12 MP, no zoom; take 5+ shots, pick the sharpest. Also take a straight-on, close photo of the whole arrangement with no people (backup for legibility).

## B. Digital lo-fi (AGENT)
So the routes are legible at print size, an agent produces grayscale, Balsamiq-style versions of the same 7 screens.
- Location: `src/lofi/*.html`, one file per screen, rendered at 1440×900 or 1024×768 → PNG @2×.
- Style: white background, `#1B2430` 1.5 px outlines, gray boxes with an "X" for images/video, gray bars for text, **real labels for buttons and headings only**. Font: "Kalam" or "Patrick Hand" (Google Fonts) for a hand-drawn feel, *or* Inter for a clean look (pick one, consistently).
- No color except a **single blue** for route arrows.
- Then build `src/lofi/flow.html`: a canvas that places the 7 lo-fi thumbnails (each ~320 px wide) in flow order with SVG arrows + trigger labels. This is the "routes" figure. Render to PNG @2× and to SVG.

## C. Lo-fi layout guide (same structure the Hi-Fi will use)
**Dashboard (desktop):** sidebar | top bar | row of 4 KPI cards (Active prints, Alerts open, AI suggestions pending, Today's quality score) | printer cards grid (3) each with mini status + "Open live" | right column: Recent alerts list.

**Live Monitor (tablet):** top bar (job, connection pill, role) | 2×3 metric tile grid (Material temp, Pump RPM, Pump power, Print speed, Nozzle Ø, Interlayer delay) | small camera thumbnail + layer progress | **bottom control bar: Pause · Resume · STOP**.

**Vision (tablet):** large camera frame with width/height measurement lines | right rail: measured vs target width/height, deviation % | control bar.

**Trends:** signal picker (checkboxes) | time window chips (5 m · 15 m · 1 h · Whole print · Custom) | big chart with range band | stats row (min / max / avg / σ).

**AI Recommendations:** left list of recommendations (pending / accepted / rejected) | right detail: title, why, predicted effect chart, confidence, Accept / Modify / Reject | "Manual adjust" button opens a drawer.

**Session Report:** header (job, dates, duration) | KPI cards | parameter table | alerts timeline | AI accuracy chart | Export buttons.

## D. Page-3 composition
- Top 55 %: team photo (cropped, rounded 8 px corners, caption "Paper lo-fi session, Oct 10, 2026").
- Bottom 45 %: digital flow diagram (`flow.png` @2×) with legend.
- Heading: "3. Lo-Fi Wireframes & Navigation Routes". One-sentence intro.
- If the page gets crowded, move the 7 individual digital lo-fi screens to an **appendix page** rather than shrinking them.
