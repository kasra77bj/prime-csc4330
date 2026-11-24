// Generates src/journey/journey-map.html (plan/07, bonus page 8) as STATIC markup (no runtime JS), so the report
// can embed it as vector. Letter landscape at 96 px/in: 1056 × 816; 12 px = 9 pt minimum text size.
// Run: node scripts/build-journey.mjs (part of npm run generate)
import fs from 'node:fs';

const T = { text: '#1C1E21', muted: '#5F6368', border: '#DCD9D3', surface: '#FFFFFF', charcoal: '#23272B',
  critical: '#C62828', critical50: '#FDECEA', ok: '#2E7D32', ok50: '#E8F5E9', teal: '#3C665E' };

const stages = [
  { n: 1, name: 'Sign in & prep', doing: 'Logs in; MFA on her phone', screens: ['S01', 'S02'], thinking: '"Hope MFA is quick with gloves."', feel: 'Impatient', level: 0, face: 'annoyed',
    pain: 'Typing codes with gloves', opp: 'Remember device 30 days; big code boxes' },
  { n: 2, name: 'Start print', doing: 'Runs sensor pre-check, presses Start', screens: ['S06', 'S07'], thinking: '"Are all sensors actually live?"', feel: 'Unsure', level: -1, face: 'meh',
    pain: 'Sensor status unclear today', opp: 'Pre-check list with live status' },
  { n: 3, name: 'Monitor', doing: 'Checks live readings between batches', screens: ['S08'], thinking: '"Everything\'s in range, good."', feel: 'Confident', level: 1, face: 'smile',
    pain: 'Watching numbers is tiring', opp: 'Calm UI; color only on exceptions' },
  { n: 4, name: 'Warning appears', doing: 'Sees banner: width −9 %', screens: ['S08'], thinking: '"Real problem or a camera glitch?"', feel: 'Worried', level: -3, face: 'frown',
    pain: 'Risk of alert fatigue', opp: 'Predictive heads-up before the limit' },
  { n: 5, name: 'Diagnose', doing: 'Opens Vision; bead is narrow', screens: ['S09'], thinking: '"It\'s real. The bead is narrower."', feel: 'Determined', level: -1, face: 'meh',
    pain: 'Doubts the measurement', opp: 'Overlay, confidence, flag artifact' },
  { n: 6, name: 'Resolve', doing: 'Escalates; Dev accepts +16 RPM', screens: ['S11'], thinking: '"Will Dev answer fast?"', feel: 'Relieved', level: 2, face: 'smile',
    pain: 'Waiting on the engineer', opp: 'Escalation receipt; AI reason shown' },
  { n: 7, name: 'Wrap up', doing: 'Print completes; hand-off note', screens: ['S14', 'S16'], thinking: '"Did we lose quality?"', feel: 'Satisfied', level: 3, face: 'laugh',
    pain: 'Reporting is manual today', opp: 'Auto report; streak and badge' },
];

const icon = (name, size = 16) => `<i data-lucide="${name}" style="width:${size}px;height:${size}px"></i>`;
const chips = (ids) => ids.map((id) => `<span class="chip-id">${id}</span>`).join('');

// Emotion curve geometry (inside the feeling lane)
const LANE_W = 700, LANE_H = 118, colW = LANE_W / 7;
const yOf = (lv) => 18 + ((3 - lv) / 6) * (LANE_H - 46);
const pts = stages.map((s, i) => [colW * (i + 0.5), yOf(s.level)]);
const curve = pts.reduce((d, p, i) => {
  if (!i) return `M${p[0]} ${p[1]}`;
  const q = pts[i - 1], cx = (q[0] + p[0]) / 2;
  return `${d} C${cx} ${q[1]} ${cx} ${p[1]} ${p[0]} ${p[1]}`;
}, '');
const faceSvg = { // Lucide: smile, meh, frown, laugh, annoyed
  smile: '<circle cx="12" cy="12" r="10"/><path d="M15 10V9"/><path d="M16.472 15a6 6 0 0 1-8.943 0"/><path d="M9 10V9"/>',
  meh: '<circle cx="12" cy="12" r="10"/><path d="M15 10V9"/><path d="M8 16h8"/><path d="M9 10V9"/>',
  frown: '<circle cx="12" cy="12" r="10"/><path d="M15 10V9"/><path d="M9 10V9"/><path d="M9 16a5 5 0 0 1 6 0"/>',
  laugh: '<circle cx="12" cy="12" r="10"/><path d="M15 10V9"/><path d="M7.084 14.302a5.12 5.12 0 0 0 9.833 0 .24.24 0 0 0-.235-.302H7.32a.24.24 0 0 0-.235.302"/><path d="M9 10V9"/>',
  annoyed: '<circle cx="12" cy="12" r="10"/><path d="M14 10h2"/><path d="M8 10h2"/><path d="M8 16h8"/>' };
const low = Math.min(...stages.map((s) => s.level)), high = Math.max(...stages.map((s) => s.level));
const emotion = `<svg width="${LANE_W}" height="${LANE_H}" viewBox="0 0 ${LANE_W} ${LANE_H}" aria-label="Emotion curve">
  <line x1="0" x2="${LANE_W}" y1="${yOf(0)}" y2="${yOf(0)}" stroke="${T.border}" stroke-dasharray="3 4"/>
  <path d="${curve}" fill="none" stroke="${T.text}" stroke-width="2"/>
  ${stages.map((s, i) => {
    const [x, y] = pts[i];
    const fill = s.level === low ? T.critical50 : s.level === high ? T.ok50 : T.surface;
    const stroke = s.level === low ? T.critical : s.level === high ? T.ok : T.text;
    return `<circle cx="${x}" cy="${y}" r="13" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
  <g transform="translate(${x - 9} ${y - 9}) scale(0.75)" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round">${faceSvg[s.face]}</g>
  <text x="${x}" y="${y + 28}" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="${T.text}">${s.feel}</text>`;
  }).join('\n  ')}
</svg>`;

const lane = (label, cells, cls = '') => `<div class="lane-label">${label}</div>${cells.map((c) => `<div class="cell ${cls}">${c}</div>`).join('')}`;

const html = `<!doctype html>
<!-- J01 · User journey map · bonus p.8 (Letter landscape) · US-01,03,05,06,07,09,10,12,13 -->
<!-- GENERATED by scripts/build-journey.mjs. Static markup: the report embeds #journey as vector. -->
<html lang="en">
<head>
<meta charset="utf-8">
<title>PRIME · User journey map</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../styles/app.css">
<style>
  #journey { width: 1056px; height: 816px; padding: 28px 32px; display: flex; flex-direction: column; gap: 14px; background: var(--surface); font-size: 12px; line-height: 1.35; color: var(--text); }
  #journey .grid-j { display: grid; grid-template-columns: 80px repeat(7, 100px); column-gap: 0; row-gap: 6px; }
  #journey .stage { height: 44px; background: var(--charcoal); color: #fff; display: flex; align-items: center; padding: 0 12px 0 16px; line-height: 1.2; font-weight: 600; font-size: 12px;
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%); margin-right: -6px; }
  #journey .stage:first-of-type { clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%); padding-left: 10px; }
  #journey .stage b { color: var(--border); font-weight: 700; margin-right: 6px; }
  #journey .lane-label { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; padding-top: 6px; }
  #journey .cell { padding: 6px 8px; border-left: 1px solid var(--border); }
  #journey .cell.sticky { border-left: 0; padding: 4px; }
  #journey .note { border-radius: 6px; padding: 7px 8px; height: 100%; }
  #journey .pain .note { background: var(--critical-50); }
  #journey .opp .note { background: var(--brand-50); }
  #journey .chip-id { display: inline-block; font-family: var(--font-mono); font-size: 12px; font-weight: 500; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 0 5px; margin-right: 4px; }
  #journey .think { font-style: italic; color: var(--text-muted); }
  #journey .persona { width: 190px; flex-shrink: 0; border-radius: 10px; background: var(--canvas); padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  #journey .persona h3 { font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
  #journey ul.facts li { display: flex; gap: 6px; align-items: flex-start; }
</style>
</head>
<body data-frame="journey">
<section id="journey">
  <header class="flex items-end justify-between">
    <div>
      <div class="text-[22px] font-bold" style="color:var(--brand-700)">User journey map</div>
      <div class="text-[13px] text-text-muted">Scenario: printing Wall Panel WP-03 when the material starts to stiffen.</div>
    </div>
    <img src="../../assets/logo/prime-logo-horizontal.svg" alt="PRIME" style="height:26px">
  </header>

  <div class="flex gap-4 flex-1 min-h-0">
    <!-- Persona -->
    <aside class="persona">
      <div class="flex items-center gap-3">
        <span class="avatar avatar-lg" style="width:44px;height:44px;font-size:15px">MO</span>
        <div><div class="text-[15px] font-bold">Maya Ortiz</div><div>Print Operator · Bay 2</div></div>
      </div>
      <ul class="facts flex flex-col gap-1.5">
        <li>${icon('hard-hat', 14)}4 yrs concrete finishing; 6 months on 3D printing</li>
        <li>${icon('tablet', 14)}Tablet, often with work gloves</li>
        <li>${icon('volume-2', 14)}Noisy floor, 8-hour shifts</li>
      </ul>
      <div><h3>Goal</h3><div class="mt-1">Finish the panel without a collapse or a re-print.</div></div>
      <div><h3>Frustrations</h3>
        <ul class="mt-1 flex flex-col gap-1.5"><li>I only notice a bad layer after it has set.</li><li>Calling the engineer means walking across the site.</li></ul></div>
      <p class="italic mt-auto border-l-[3px] pl-2" style="border-color:var(--border)">"Tell me early, tell me plainly, and let me get help fast."</p>
    </aside>

    <!-- Lanes -->
    <div class="flex flex-col gap-2 min-w-0">
      <div class="grid-j">
        <div></div>${stages.map((s) => `<div class="stage"><b>${s.n}</b>${s.name}</div>`).join('')}
        ${lane('Doing', stages.map((s) => s.doing))}
        ${lane('Screen', stages.map((s) => chips(s.screens)))}
        ${lane('Thinking', stages.map((s) => `<span class="think">${s.thinking}</span>`))}
        <div class="lane-label">Feeling</div>
        <div style="grid-column: 2 / span 7; height:${LANE_H}px">${emotion}</div>
        ${lane('Pain points', stages.map((s) => `<div class="note">${s.pain}</div>`), 'sticky pain')}
        ${lane('PRIME helps', stages.map((s) => `<div class="note">${s.opp}</div>`), 'sticky opp')}
        <div class="lane-label">Engineer · Dev</div>
        <div class="cell" style="grid-column: 2 / span 4"></div>
        <div class="cell" style="grid-column: 6 / span 2"><div class="note flex items-center gap-1.5 flex-wrap" style="background:var(--canvas)">Push alert ${icon('arrow-right', 12)} AI review ${icon('arrow-right', 12)} Accepts +16 RPM <span class="chip-id">S11</span></div></div>
        <div class="cell"></div>
      </div>
    </div>
  </div>

  <footer class="flex items-center gap-2 text-[13px] rounded-[8px] px-4 py-2.5" style="background:var(--canvas)">
    ${icon('lightbulb', 16)}<span><b>Key insight:</b> the biggest dip is the doubt between <i>warning</i> and <i>diagnosis</i>. The Vision overlay and predictive heads-ups target exactly that gap.</span>
  </footer>
</section>
</body>
</html>
`;
fs.mkdirSync('src/journey', { recursive: true });
fs.writeFileSync('src/journey/journey-map.html', html);
console.log('Wrote src/journey/journey-map.html');
