# 01 · Design System (page 2 + tokens for every screen)

> **Palette source:** the team's Figma "Color Pallet" frame (Neutrals · Brand and Interaction · Status · Data Visualization). The 17 hex codes below are the team's. One tint (`warn-50`) is derived from the palette's own ochre so the warning state has a background; see §2.6.

## 1. Design principles
1. **Calm until it matters.** We follow the *ISA-101 "high-performance HMI"* idea used in industrial control rooms: the interface is mostly warm neutral gray and white, and **saturated color appears only when something needs attention**. A screen full of green and red teaches operators to ignore color.
2. **Blue means "you can act here."** Brand blue is reserved for interactive elements (buttons, links, selected tabs, focus). Dark structural surfaces use charcoal, not blue, so blue never gets diluted.
3. **One glance, one answer.** Every live value shows its number, unit, normal range, and status in one tile.
4. **Safety controls never move.** Pause / Resume / Stop live in the same place on every print screen.
5. **AI advises, people decide.** AI predictions are drawn in violet in every graph, and AI recommendation cards carry a sparkles icon + "AI" label, so a model suggestion is never confused with a measured value or a system alarm.
6. **Never color alone.** Every status uses color **+ icon + text label** (color-blind safe; about 8 % of men have red-green color deficiency, and our status pair is red/green).

## 2. Color palette (page 2 swatches = the team's Figma frame)

### 2.1 Neutrals
| Token | Hex | Role | Justification |
|---|---|---|---|
| `canvas` | **#F5F4F1** | App background | Warm off-white, like cured concrete. It ties the UI to the material and is softer than pure white over multi-hour shifts. |
| `surface` | **#FFFFFF** | Cards, panels, modals | Lifts content off the warm canvas with minimal shadow. |
| `border` | **#DCD9D3** | Borders, dividers, chart grid, disabled fills | Warm gray structure that stays quiet (non-text only). |
| `text` | **#1C1E21** | Primary text, live values | Near-black, 15.2:1 on canvas. Big readings stay legible from about 2 m away on the print floor. |
| `text-muted` | **#5F6368** | Secondary text, units, ranges, captions, placeholder | 6.1:1 on white, 5.5:1 on canvas (WCAG AA). |
| `charcoal` | **#23272B** | Desktop sidebar, tablet top bar, coach-mark and toast backgrounds | Dark industrial surface that frames the content; keeps blue free for actions. White text = 15.0:1. |

### 2.2 Brand and Interaction
| Token | Hex | Role | Justification |
|---|---|---|---|
| `brand-600` | **#1F5F8B** | Primary buttons, links, selected tab, focus ring, logo "P" traces | Steel blue drawn from the logo. Signals engineering trust; the single "do this" color. White text = 6.8:1. |
| `brand-700` | **#174A6D** | Hover/pressed states, report headings, active sidebar item indicator, logo | Darker step of the same hue for state feedback and hierarchy. White text = 9.4:1. |
| `brand-50` | **#E6EEF4** | Selected rows, info banners, **AI recommendation card background**, target band in charts | Light tint keeps selection and AI advice calm and clearly "informational", not alarming. Brand-600 text on it = 5.8:1. |

### 2.3 Status
| Token | Hex | Role | Justification |
|---|---|---|---|
| `critical` | **#C62828** | Out of range, defect detected, sensor lost, **STOP button** | Red = danger/stop (ANSI Z535, ISO 3864). Reserved so a red element is never ignored. White text = 5.6:1. |
| `critical-50` | **#FDECEA** | Critical banner / tile background | Tint lets red text sit on it at 4.9:1. |
| `ok` | **#2E7D32** | In range, connected, success, achievement fill, logo arrow | Deep green passes AA on its tint (4.6:1). Per ISA-101 it appears small (a dot + "In range"), never as big fills in the normal state. |
| `ok-50` | **#E8F5E9** | Success toast / "decision applied" background | Soft confirmation. |

### 2.4 Data Visualization (graphs only)
| Token | Hex | Role in charts | Justification |
|---|---|---|---|
| `viz-teal` | **#3C665E** | Second measured series (e.g., layer height, pump power) | Muted, desaturated so multi-series charts stay calm; distinct from status green by its gray-blue cast. |
| `viz-violet` | **#7E57A6** | **AI predicted values** (dashed line), AI confidence bars | Violet has no status meaning, so "prediction" reads instantly and is never mistaken for an alarm. |
| `viz-ochre` | **#B7791F** | Third series; **warning zone shading** in charts | Warm earthy tone that fits the concrete theme and carries a natural "caution" connotation. |

Primary measured series in every chart = `text` #1C1E21 solid line. Target band = `brand-50`. Limit lines = `critical` 1 px dashed. Gridlines = `border`.

### 2.5 Page-2 layout
Recreate the team's Figma frame (Neutrals left; Status top-right; Data Visualization below it; Brand and Interaction bottom-left), but **add under each swatch its token name + role in 1 line**, then a short justification paragraph (principles 1, 2, 5, 6) and a note: "All text/background pairs checked: WCAG 2.1 AA."
Fix the title typo on the page: "Color **Palette**" (not "Pallet").

### 2.6 Gap handled: the warning state
The palette's status group has red and green only, but the specs rely on a **warning** state (e.g., "layer width trending −9 %", predicted interlayer delay approaching the limit). Rule:
- **Warning UI uses `viz-ochre` #B7791F** for the icon, the 4 px tile border, and the chart warn zone, with **text always in `text` #1C1E21** (ochre on white is only 3.6:1, so ochre is never used for text).
- Banner/tile background: **`warn-50` #FBF3E4** (derived light tint of the ochre; the one addition to the team palette).
- The warning pill reads "▲ Warning" with the `alert-triangle` icon, so it differs from critical by icon and label too, not just hue.

> Team decision needed: approve this ochre extension, or treat all out-of-range states as `critical`. Agents should use the ochre rule above unless told otherwise.

## 3. Typography
| Use | Font | Size / weight |
|---|---|---|
| UI text | **Inter** (Google Fonts) | 14 / 400 body, 13 / 500 labels |
| Headings | Inter | H1 28/600 · H2 20/600 · H3 16/600 |
| Live values | **Inter, `font-variant-numeric: tabular-nums`** | Desktop tile 32/600, Tablet tile 44/700 |
| Units, codes, IDs | **JetBrains Mono** | 12/500 |
| Logo wordmark | Keep existing geometric sans (rebuild with **Montserrat 800** if vectorizing) | — |

## 4. Spacing, shape, elevation
- 8-pt grid: 4, 8, 12, 16, 24, 32, 48.
- Radius: 8 px cards, 6 px inputs/buttons, 999 px pills.
- Shadow: `0 1px 2px rgba(28,30,33,.06), 0 1px 3px rgba(28,30,33,.10)` on cards only.
- Desktop: 240 px charcoal sidebar + 64 px white top bar + 12-col content grid, 24 px gutters, max 1440.
- Tablet: charcoal top bar, no sidebar (bottom tab bar instead), 72 px persistent control bar at the bottom, touch targets ≥ 56 px (STOP 64 px).

## 5. Iconography
**Lucide** icons, 20 px (desktop) / 24 px (tablet), 1.75 stroke. Status icons: `check-circle` (ok), `alert-triangle` (warning), `octagon-alert` (critical), `sparkles` (AI), `wifi-off` (offline), `lock` (role-restricted).

## 6. Core components (build once in `components.html`, reuse everywhere)
| Component | Spec |
|---|---|
| **Metric tile** | White card · label + info icon · big value + unit (`text`) · range text "Normal 18–30 °C" (`text-muted`) · 60-min sparkline (`text` line on `brand-50` target band) · status pill. Border-left 4 px in `viz-ochre` (warning) or `critical` *only when not OK*. |
| **Status pill** | Icon + text, 24 px tall. OK: `ok` on `ok-50`. Warning: `text` on `warn-50` + ochre icon. Critical: `critical` on `critical-50`. |
| **Control bar** | Full-width, white, top `border`. Left: job name + layer progress. Right: `Pause` (secondary: white, `brand-600` border + text, 56 px), `Resume` (primary `brand-600`), `Stop` (`critical` fill, white label, 64 px, press-and-hold 1.5 s with a ring progress → prevents accidental stops). |
| **Alert banner** | Full-width under the top bar, `warn-50` or `critical-50` background, icon, message in `text`, "View" + "Acknowledge" buttons, elapsed timer. |
| **AI recommendation card** | `brand-50` background, `brand-600` left border, chip "✦ AI" (sparkles icon, `brand-700` text), title "Increase pump speed 246 → 262 RPM", *Why* (2 bullets), *Predicted effect* (mini chart: actual `text` vs predicted `viz-violet` dashed), confidence bar in `viz-violet`, buttons `Accept` · `Modify` · `Reject`. |
| **Connection pill** | Top bar: ● Live (`ok`) / ◐ Reconnecting… (ochre icon) / ○ Offline – 37 readings buffered (`critical`). |
| **Role badge** | Top bar next to avatar, `brand-50` bg, `brand-700` text: "Operator" / "Engineer" / "Admin". |
| **Locked action** | Button with `border` fill, `text-muted` label, lock icon + tooltip "Engineer approval required". |
| **Coach mark** | Onboarding tooltip: `charcoal` bg, white text, step "2 of 5", Next (`brand-600`) / Skip. |
| **Nudge toast** | `charcoal` bg (neutral) or `ok-50` (success), bottom-right (desktop) / above control bar (tablet), auto-dismiss 8 s, max 1 visible. |
| **Badge** | 64 px circular medal, `brand-700` ring, `ok` fill, white Lucide icon; locked = `border` fill + `text-muted` icon. |

## 7. Tokens file (agents create `src/styles/tokens.css`)
```css
:root{
  /* Neutrals */
  --canvas:#F5F4F1; --surface:#FFFFFF; --border:#DCD9D3;
  --text:#1C1E21; --text-muted:#5F6368; --charcoal:#23272B;
  /* Brand and Interaction */
  --brand-600:#1F5F8B; --brand-700:#174A6D; --brand-50:#E6EEF4;
  /* Status */
  --critical:#C62828; --critical-50:#FDECEA;
  --ok:#2E7D32; --ok-50:#E8F5E9;
  --warn-50:#FBF3E4; /* derived from viz-ochre, see 01 §2.6 */
  /* Data visualization (graphs; ochre also = warning accent) */
  --viz-teal:#3C665E; --viz-violet:#7E57A6; --viz-ochre:#B7791F;
  --radius-card:8px; --radius-ctl:6px;
  --font-ui:'Inter',system-ui,sans-serif; --font-mono:'JetBrains Mono',ui-monospace,monospace;
}
```
Mirror these in `tailwind.config` (`theme.extend.colors`) so classes like `bg-brand-600` and `text-text-muted` work.
