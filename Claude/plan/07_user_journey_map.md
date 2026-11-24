# 07 · User Journey Map (bonus page 8, +10 pts)

**Format:** one landscape Letter page (11×8.5 in), built as `src/journey/journey-map.html`, rendered to PDF/PNG @2×.
**Persona card (left column, 220 px):** *Maya Ortiz, Print Operator, Bay 2.* 4 yrs in concrete finishing, 6 months on 3DCP, uses a tablet with work gloves, noisy floor, 8-hour shifts. Goal: "Finish the panel without a collapse or a re-print." Frustrations: "I only notice a bad layer after it's already set", "Calling the engineer means walking across the site." Quote in italics.

**Scenario:** "Printing Wall Panel WP-03 when the material starts to stiffen."

## Grid (columns = stages, rows = lanes)
| Lane ↓ / Stage → | 1. Sign in & prep | 2. Start print | 3. Monitor | 4. Warning appears | 5. Diagnose | 6. Resolve | 7. Wrap up |
|---|---|---|---|---|---|---|---|
| **Doing** | Logs in, MFA on phone | Runs sensor pre-check, presses Start | Watches tiles between material batches | Amber banner: width −9 % | Opens Vision, confirms narrow bead | Escalates; engineer accepts AI +16 RPM | Print completes, hand-off note |
| **Touchpoint (screen)** | S01/S02 | S06 test, S07 Dashboard | S08 Live | S08 banner + nudge | S09 Vision | S11 (engineer), nudge "Applied…" | S14 report, S16 summary |
| **Thinking** | "Hope MFA is quick with gloves." | "Are all sensors actually live?" | "Everything's in range, good." | "Is this real or a camera glitch?" | "It's real; the bead is narrower." | "Will Dev answer fast?" | "Did we lose quality?" |
| **Feeling** (emotion curve) | Neutral | Slightly anxious | Calm | Alarmed (low point) | Focused | Relieved (high point) | Proud |
| **Pain points** | Typing codes with gloves | Unclear sensor status in old workflow | Watching numbers is tiring | Alert fatigue risk | Doubt about measurement | Waiting on engineer | Reporting is manual today |
| **Opportunities (PRIME feature)** | "Remember device 30 days", big MFA boxes | Pre-check checklist with live pills | Calm UI, color only on exceptions | Predictive heads-up *before* the limit; plain-language message | Overlay + measurement confidence + "flag artifact" | Escalation receipt with ETA; AI recommendation with reason | Auto summary report; streak + badge |

## Visual spec
- Stage headers: navy-900 chevrons across the top.
- **Emotion curve:** smooth SVG line across stages, points with simple face icons (Lucide `smile` / `meh` / `frown`), low point in critical tint, high point in ok tint.
- Pain points in light red-tinted sticky cards; opportunities in blue-tinted sticky cards with the screen ID chip (S08…), which links the map back to the Hi-Fi screens.
- Secondary mini-lane (optional, thin): **Engineer Dev** touchpoints at stages 5–6 (push notification → AI review → accept).
- Footer: "Key insight: the biggest emotional dip is the uncertainty between *warning* and *diagnosis*; PRIME's Vision overlay and predictive heads-up target exactly that gap."
- Keep text ≤ 12 words per cell; font ≥ 9 pt at print size.
