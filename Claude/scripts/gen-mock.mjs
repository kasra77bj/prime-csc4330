// Generates src/data/mock.json, the single source of truth for every number on every screen (plan/00 + 05 + 06).
// Deterministic (seeded), so re-running produces identical output. Run: npm run mock
//
// Timeline of the demo job (Job #A-1027 · WP-03 · Gantry-02), Fri Oct 9 2026, Shift B:
//   13:21:20  print start (t = 0)                 one layer every 105 s → layer(t) = floor(t/105) + 1
//   14:31:00  t=4180  layer 40  alert A-311 "width trending −5 %" (acknowledged by Maya in 11 s)
//   14:32:10  t=4250  layer 41  width 36.9 mm (Trends tooltip)
//   14:33:18  t=4318  layer 42  alert A-312 width below tolerance (< 37.0 mm), open
//   14:33:40  t=4340  layer 42  AI recommendation R-118 "246 → 262 RPM" (87 %)
//   14:34:00  t=4360  layer 42  ★ "NOW" for Dashboard, Live Monitor, Vision, AI review: width 36.4 mm (−9 %)
//   14:35:00  t=4420  layer 43  pump adjusted 246 → 262 RPM (AI accepted by Dev Patel), applied at layer 43
//   14:36:00  t=4480  layer 43  "NOW" for Trends (1 h window 13:36–14:36 + AI prediction for the next 10 min)
//   14:38:30  t=4630  layer 45  width recovered to 38.9 mm (+2.5 mm) → "decision closure" nudge
import fs from 'node:fs';

// ---------- helpers ----------
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = mulberry32(4330);
const gauss = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const START = 13 * 3600 + 21 * 60 + 20; // 13:21:20
const clock = (t) => { const s = START + t; const p = (n) => String(n).padStart(2, '0'); return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`; };
const LAYER_SEC = 105, STEP = 10, DURATION = 7200;
const layerAt = (t) => Math.floor(t / LAYER_SEC) + 1;
const NOW = 4360, ADJUST = 4420, TRENDS_NOW = 4480;
const idx = (t) => t / STEP;
const stats = (a) => { const m = a.reduce((s, x) => s + x, 0) / a.length; const sd = Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); return { min: Math.min(...a), max: Math.max(...a), avg: r1(m), sd: r1(sd) }; };

// ---------- per-layer layer-width means (the under-extrusion story) ----------
const LAST_LAYER = layerAt(DURATION);
const widthMean = [];
for (let L = 1; L <= LAST_LAYER; L++) widthMean[L] = 38.95 + 1.2 * Math.sin(L / 4.5) + 0.45 * gauss();
Object.assign(widthMean, { 39: 38.4, 40: 38.0, 41: 37.1, 42: 36.5, 43: 36.7, 44: 37.9, 45: 38.9, 46: 39.3 });
for (let L = 47; L <= LAST_LAYER; L++) widthMean[L] = 39.6 + 0.25 * gauss();

// ---------- 10-second series ----------
const N = DURATION / STEP + 1;
const sig = { materialTemp: [], ambientTemp: [], pumpRpm: [], pumpPower: [], printSpeed: [], layerWidth: [], layerHeight: [], interlayerDelay: [] };
const delayByLayer = (L) => {
  if (L <= 42) return Math.round(104 + 28 * Math.pow((L - 1) / 41, 2.2)); // creeping up to 132 s at layer 42
  return [149, 158, 150, 142, 138, 135][L - 43] ?? 134;                   // after the pump change it settles
};
for (let i = 0; i < N; i++) {
  const t = i * STEP, L = layerAt(t), frac = (t % LAYER_SEC) / LAYER_SEC;
  sig.materialTemp.push(r1(24.6 + 0.001 * (t - NOW) - (t > NOW ? 0.0004 * (t - NOW) : 0) + 0.06 * gauss()));
  sig.ambientTemp.push(r1(27.1 + 0.00025 * (t - NOW) + 0.08 * gauss()));
  const rpm = t < ADJUST ? 246 : t < ADJUST + 30 ? 246 + (16 * (t - ADJUST)) / 30 : 262;
  sig.pumpRpm.push(Math.round(rpm + (rand() < 0.25 ? (rand() < 0.5 ? -1 : 1) : 0)));
  sig.pumpPower.push(r2((t < ADJUST ? 1.9 : 2.04) + 0.03 * gauss()));
  sig.printSpeed.push(r1(100 + 0.2 * gauss()));
  // width: smooth (linear) blend between layer centres so there are no steps at layer boundaries
  const pos = t / LAYER_SEC + 0.5, L0 = Math.max(1, Math.min(LAST_LAYER, Math.floor(pos))), L1 = Math.min(L0 + 1, LAST_LAYER), k = pos - Math.floor(pos);
  const w = widthMean[L0] + (widthMean[L1] - widthMean[L0]) * k + 0.12 * gauss();
  sig.layerWidth.push(r1(Math.min(40.7, Math.max(36.5, w))));
  const h = (L >= 40 && L <= 44 ? 14.8 : 15.0) + 0.12 * gauss();
  sig.layerHeight.push(r1(Math.min(15.4, Math.max(14.6, h))));
  sig.interlayerDelay.push(delayByLayer(L));
}
// Pin the values the spec quotes (same moment = same value everywhere)
sig.layerWidth[idx(NOW)] = 36.4; sig.layerWidth[idx(4250)] = 36.9; sig.layerWidth[idx(36 * LAYER_SEC - 50)] = 40.8;
sig.layerWidth[idx(4630)] = 38.9;
sig.materialTemp[idx(NOW)] = 24.6; sig.materialTemp[idx(NOW - 1800)] = 22.8; // +1.8 °C / 30 min
sig.ambientTemp[idx(NOW)] = 27.1; sig.pumpRpm[idx(NOW)] = 246; sig.pumpPower[idx(NOW)] = 1.9; sig.printSpeed[idx(NOW)] = 100;
sig.layerHeight[idx(NOW)] = 14.8; sig.interlayerDelay[idx(NOW)] = 132;
sig.pumpRpm[idx(ADJUST + 30)] = 262;

// Per-layer averages for layers 1..42 (Vision mini chart, streak math)
const perLayer = (key, upto) => Array.from({ length: upto }, (_, k) => {
  const L = k + 1, from = (L - 1) * LAYER_SEC, to = Math.min(L * LAYER_SEC, DURATION);
  const vals = sig[key].slice(idx(Math.ceil(from / STEP) * STEP), Math.floor(to / STEP));
  return r1(vals.reduce((s, x) => s + x, 0) / vals.length);
});
const widthPerLayer = perLayer('layerWidth', 42); widthPerLayer[41] = 36.4; widthPerLayer[40] = 37.1;

// Trends window (1 h ending 14:36:00) stats for layer width
const winW = sig.layerWidth.slice(idx(TRENDS_NOW - 3600), idx(TRENDS_NOW) + 1);
const trendsStats = stats(winW);

// 60-min sparklines ending at NOW (every 30 s → 121 points), used by metric tiles
const spark = (key) => sig[key].slice(idx(NOW - 3600), idx(NOW) + 1).filter((_, k) => k % 3 === 0);

// ---------- AI predictions ----------
const predWidthLayers = [{ layer: 43, value: 37.2 }, { layer: 44, value: 38.3 }, { layer: 45, value: 39.0 }, { layer: 46, value: 39.4 }, { layer: 47, value: 39.6 }, { layer: 48, value: 39.6 }];
const predDelayLayers = [{ layer: 43, value: 151 }, { layer: 44, value: 166 }, { layer: 45, value: 182 }, { layer: 46, value: 197 }, { layer: 47, value: 213 }, { layer: 48, value: 228 }];
// Trends: AI predicted width for the 10 min after 14:36:00 (every 30 s)
const trendsPrediction = Array.from({ length: 21 }, (_, k) => {
  const t = TRENDS_NOW + k * 30; const x = k / 20;
  return { time: clock(t), t, value: r1(36.7 + (39.6 - 36.7) * (1 - Math.pow(1 - Math.min(1, x * 1.6), 2))) };
});

// ---------- Session report (spec 05 S14: Oct 8, 13:20–15:25, 120 layers) ----------
const rs = mulberry32(1008);
const g2 = () => { let u = 0, v = 0; while (!u) u = rs(); while (!v) v = rs(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const repObserved = [], repPredicted = [];
for (let L = 1; L <= 120; L++) {
  let base = 39.4 + 0.4 * Math.sin(L / 9);
  if (L >= 38 && L <= 44) base -= [0.8, 1.6, 2.4, 3.0, 2.2, 1.0, 0.3][L - 38];
  const obs = r1(base + 0.35 * g2());
  repObserved.push(obs);
  repPredicted.push(r1(base + 0.95 * Math.sin(L / 2.6 + 1) + 0.12 * g2() + (L >= 38 && L <= 41 ? 0.6 : 0))); // smooth model error, MAE ≈ 0.7 mm // smooth model error, MAE ≈ 0.7 mm // smooth model error, MAE ≈ 0.7 mm
}
repObserved[40] = 36.6; // layer 41 dip
const mae = r1(repObserved.reduce((s, o, k) => s + Math.abs(o - repPredicted[k]), 0) / 120);

// ---------- assemble ----------
const people = {
  maya: { id: 'u-01', name: 'Maya Ortiz', initials: 'MO', role: 'Operator', email: 'maya.ortiz@prime.example', bays: ['Bay 2'], mfa: 'Enrolled', lastActive: 'Now' },
  dev: { id: 'u-02', name: 'Dev Patel', initials: 'DP', role: 'Engineer', email: 'dev.patel@prime.example', bays: ['Bay 1', 'Bay 2', 'Bay 3'], mfa: 'Enrolled', lastActive: '2 min ago' },
  sam: { id: 'u-03', name: 'Sam Lee', initials: 'SL', role: 'Admin', email: 'sam.lee@prime.example', bays: ['All bays'], mfa: 'Enrolled', lastActive: 'Today 09:12' },
  jordan: { id: 'u-04', name: 'Jordan Brooks', initials: 'JB', role: 'Manager', email: 'jordan.brooks@prime.example', bays: ['All bays'], mfa: 'Pending', lastActive: 'Yesterday 17:40' },
};

const mock = {
  _readme: 'Generated by scripts/gen-mock.mjs. Do not hand-edit; change the generator and run `npm run mock`. Times are local (CT). See _notes for spec conflicts.',
  meta: { date: '2026-10-09', dateLabel: 'Fri Oct 9', shift: 'Shift B', clock: '14:34', greeting: 'Good afternoon', site: 'Baton Rouge Yard', product: 'PRIME', tagline: 'AI-Powered Concrete 3D Printing Platform' },
  people,
  currentUserByScreen: { desktop: 'dev', tablet: 'maya', admin: 'sam', reports: 'jordan' },

  job: {
    id: 'A-1027', label: 'Job #A-1027', name: 'Wall Panel WP-03', short: 'WP-03', printer: 'Gantry-02', bay: 'Bay 2',
    layer: 42, layers: 120, progressPct: 35, elapsed: '01:12:40', eta: '02:05:00', etaMeaning: 'time remaining',
    startedAt: '13:21:20', now: '14:34:00', nozzleDiameterMm: 30, qualityScore: 91, operator: 'maya', engineer: 'dev',
  },

  // Canonical "now" values (layer 42, 14:34:00). Shown identically on every screen of this moment.
  signals: {
    materialTemp: { label: 'Material temperature', unit: '°C', value: 24.6, min: 18, max: 30, rangeText: 'Normal 18–30 °C', status: 'ok', trendText: '+1.8 °C in 30 min', alertExample: 31.2 },
    ambientTemp: { label: 'Ambient temperature', unit: '°C', value: 27.1, min: 10, max: 35, rangeText: 'Normal 10–35 °C', status: 'ok' },
    pumpRpm: { label: 'Pump speed', unit: 'RPM', value: 246, min: 180, max: 320, rangeText: 'Normal 180–320 RPM', status: 'ok' },
    pumpPower: { label: 'Pump power', unit: 'kW', value: 1.9, min: 1.2, max: 2.8, rangeText: 'Normal 1.2–2.8 kW', status: 'ok', alertExample: 2.95 },
    printSpeed: { label: 'Print speed', unit: 'mm/s', value: 100, min: 60, max: 140, rangeText: 'Normal 60–140 mm/s', status: 'ok', secondary: 'Nozzle Ø 30 mm' },
    layerWidth: { label: 'Layer width', unit: 'mm', value: 36.4, target: 40, tol: 3, min: 37, max: 43, rangeText: 'Target 40 ± 3 mm', status: 'warn', deviationPct: -9, deviationText: '▼ −9 %' },
    layerHeight: { label: 'Layer height', unit: 'mm', value: 14.8, target: 15, tol: 1.5, min: 13.5, max: 16.5, rangeText: 'Target 15 ± 1.5 mm', status: 'ok', deviationPct: -1 },
    interlayerDelay: { label: 'Interlayer delay', unit: 's', value: 132, min: 60, max: 240, rangeText: 'Normal 60–240 s', status: 'ok', predictedNext: 151, predictedIn6Layers: 228 },
    aiConfidencePct: 87,
  },
  sparklines60m: { stepSec: 30, from: clock(NOW - 3600), to: clock(NOW),
    materialTemp: spark('materialTemp'), pumpRpm: spark('pumpRpm'), pumpPower: spark('pumpPower'), printSpeed: spark('printSpeed'),
    layerWidth: spark('layerWidth'), layerHeight: spark('layerHeight'), interlayerDelay: spark('interlayerDelay') },

  moments: {
    alertTrend: { time: '14:31:00', t: 4180, layer: 40, layerWidth: 38.0, deviationPct: -5, text: 'Width trending −5 %' },
    tooltip: { time: '14:32:10', t: 4250, layer: 41, layerWidth: 36.9 },
    alertBelow: { time: '14:33:18', t: 4318, layer: 42, layerWidth: 36.9, elapsedAtNow: '0:42' },
    now: { time: '14:34:00', t: NOW, layer: 42 },
    adjust: { time: '14:35:00', t: ADJUST, layer: 43, from: 246, to: 262, by: 'dev', type: 'AI accepted' },
    trendsNow: { time: '14:36:00', t: TRENDS_NOW, layer: 43 },
    recovered: { time: '14:38:30', t: 4630, layer: 45, layerWidth: 38.9, deltaMm: 2.5 },
  },

  series: {
    note: '10-second samples from print start (13:21:20) for 2 h. Index i ↔ t = 10·i s. Samples after 14:34:00 are what happened after the AI change (used by Trends and nudges).',
    start: '13:21:20', stepSec: STEP, layerSec: LAYER_SEC, nowIndex: idx(NOW), adjustIndex: idx(ADJUST), trendsNowIndex: idx(TRENDS_NOW),
    ...sig,
  },
  perLayer: { layerWidth: widthPerLayer, last10: widthPerLayer.slice(32).map((v, k) => ({ layer: 33 + k, value: v })) },

  trends: {
    window: '1 h', from: '13:36:00', to: '14:36:00', clock: '14:36', selectedSignal: 'layerWidth',
    timeChips: ['5 m', '15 m', '1 h', 'Whole print', 'Custom'],
    stats: { min: trendsStats.min, max: trendsStats.max, avg: trendsStats.avg, sd: trendsStats.sd },
    hover: { time: '14:32:10', value: 36.9, layer: 41 },
    annotations: [{ time: '14:31', text: 'Alert raised' }, { time: '14:35', text: 'Pump adjusted' }],
    prediction: trendsPrediction,
    signalList: ['materialTemp', 'pumpRpm', 'pumpPower', 'printSpeed', 'layerWidth', 'layerHeight', 'interlayerDelay'],
  },

  vision: {
    measured: [
      { label: 'Width', value: 36.4, target: 40.0, deltaPct: -9, status: 'warn' },
      { label: 'Height', value: 14.8, target: 15.0, deltaPct: -1, status: 'ok' },
    ],
    measurementConfidencePct: 93, camera: 'CAM-2A · nozzle side', frameTime: '14:34:00', overlay: true,
  },

  printers: [
    { id: 'Gantry-02', bay: 'Bay 2', status: 'printing', job: 'Wall Panel WP-03', jobId: 'A-1027', layer: 42, layers: 120,
      mini: { temp: 24.6, rpm: 246, speed: 100, width: 36.4 }, pill: { status: 'warn', text: 'Width −9 %' } },
    { id: 'Arm-01', bay: 'Bay 1', status: 'printing', job: 'Column C-12', jobId: 'A-1024', layer: 88, layers: 96,
      mini: { temp: 23.1, rpm: 238, speed: 92, width: 39.8 }, pill: { status: 'ok', text: 'In range' } },
    { id: 'Gantry-03', bay: 'Bay 3', status: 'idle', job: null, next: 'Footing F-2', nextAt: '15:30', action: 'Start pre-check' },
  ],

  kpis: { activePrints: 2, openAlerts: 2, openAlertsSplit: '1 warning · 1 info', aiPending: 1,
    shiftQuality: 94, shiftQualityDelta: '+3 vs yesterday', shiftQualitySpark: [88, 90, 89, 91, 92, 91, 93, 94] },

  alerts: [
    { id: 'A-312', severity: 'warning', signal: 'Layer width', message: 'Layer width 36.4 mm is below target (40 ± 3) and dropping. Check Vision.', short: 'Layer width below tolerance on WP-03', printer: 'Gantry-02', job: 'WP-03', raisedAt: '14:33:18', status: 'Open', owner: 'maya' },
    { id: 'A-313', severity: 'info', signal: 'Camera', message: 'Camera calibration on Arm-01 is due (last calibrated 7 days ago).', short: 'Arm-01 camera calibration due', printer: 'Arm-01', job: 'C-12', raisedAt: '13:05:00', status: 'Open', owner: 'dev' },
    { id: 'A-311', severity: 'warning', signal: 'Layer width', message: 'Layer width trending −5 % over 3 layers.', short: 'Width trending −5 % on WP-03', printer: 'Gantry-02', job: 'WP-03', raisedAt: '14:31:00', status: 'Acknowledged', owner: 'maya', responseSec: 11 },
    { id: 'A-309', severity: 'critical', signal: 'Pump power', message: 'Pump power spiked to 2.95 kW (limit 2.8). Nozzle partially blocked; cleared.', short: 'Pump power spike 2.95 kW on C-12', printer: 'Arm-01', job: 'C-12', raisedAt: '11:52:40', status: 'Resolved', owner: 'dev' },
    { id: 'A-305', severity: 'critical', signal: 'Material temperature', message: 'Material temperature 31.2 °C above 30 °C limit. Batch cooled with chilled water.', short: 'Material temp 31.2 °C on C-12', printer: 'Arm-01', job: 'C-12', raisedAt: '10:14:05', status: 'Resolved', owner: 'maya' },
    { id: 'A-301', severity: 'warning', signal: 'Interlayer delay', message: 'Interlayer delay 236 s, close to the 240 s limit.', short: 'Interlayer delay 236 s on WP-02', printer: 'Gantry-02', job: 'WP-02', raisedAt: 'Oct 8 15:41', status: 'Resolved', owner: 'dev' },
  ],

  aiRecommendations: {
    counts: { pending: 1, accepted: 4, rejected: 1, manual: 2 },
    pending: {
      id: 'R-118', createdAt: '14:33:40', job: 'WP-03', title: 'Increase pump speed 246 → 262 RPM', parameter: 'Pump RPM', from: 246, to: 262, modifyValue: 258,
      confidencePct: 87,
      why: [
        'Layer width has dropped 9 % over 6 layers while pump power is stable → under-extrusion.',
        'Material temperature rising (+1.8 °C/30 min) is increasing viscosity.',
      ],
      predictedEffect: 'Width returns to 39.6 ± 0.8 mm within 3 layers.', predicted: predWidthLayers, predictedBand: 0.8,
      risk: 'Low: within pump limits (max 320 RPM).',
      footnote: 'Changes apply at next layer start. Logged to audit trail as Dev Patel · Engineer.',
      rejectReasons: ['Sensor artifact', 'Material change planned', 'Disagree with model', 'Other'],
    },
    history: [
      { id: 'R-117', time: '13:52', job: 'WP-03', title: 'Reduce print speed 104 → 100 mm/s', confidencePct: 82, outcome: 'Accepted', by: 'dev' },
      { id: 'R-116', time: '12:20', job: 'C-12', title: 'Reduce pump speed 252 → 240 RPM', confidencePct: 64, outcome: 'Rejected', by: 'dev', reason: 'Sensor artifact' },
      { id: 'R-115', time: '11:40', job: 'C-12', title: 'Increase pump speed 238 → 244 RPM', confidencePct: 79, outcome: 'Accepted', by: 'dev' },
      { id: 'R-112', time: '10:05', job: 'C-12', title: 'Shorten interlayer delay 150 → 135 s', confidencePct: 84, outcome: 'Accepted', by: 'dev' },
      { id: 'R-109', time: 'Oct 8', job: 'WP-02', title: 'Increase pump speed 250 → 256 RPM', confidencePct: 88, outcome: 'Accepted', by: 'dev' },
    ],
    manual: [
      { id: 'M-021', time: '12:45', job: 'C-12', parameter: 'Print speed', from: 96, to: 92, unit: 'mm/s', by: 'dev', note: 'New aggregate batch is slightly stiffer; slowing down for the next 10 layers.' },
      { id: 'M-020', time: 'Oct 8', job: 'WP-02', parameter: 'Pump RPM', from: 256, to: 252, unit: 'RPM', by: 'dev', note: 'Ambient dropped after sunset; reduced flow to match.' },
    ],
    manualDrawer: { parameters: ['Pump RPM', 'Print speed'], parameter: 'Print speed', current: 100, next: 96, unit: 'mm/s', note: 'Slowing down while the new batch is mixed; will restore at layer 50.', applyAt: 'next layer (43)' },
  },

  escalation: { to: 'dev', responseText: 'usually responds in ~2 min' },

  session: {
    id: 'S-1008-02', title: 'Session report · WP-03 · Gantry-02', date: 'Oct 8, 2026', from: '13:20', to: '15:25', duration: '2 h 05 m', status: 'Completed',
    kpis: { qualityScore: 94, layersDone: 120, layers: 120, alerts: 5, criticalAlerts: 0, adjustments: 6, adjustmentsSplit: '4 AI-accepted · 1 modified · 1 manual', predictionAccuracyPct: 91, maeMm: 0.7, maeComputedMm: mae },
    widthObserved: repObserved, widthPredicted: repPredicted,
    alertsTimeline: [
      { time: '13:43', layer: 23, severity: 'info', text: 'Camera re-focused' },
      { time: '13:58', layer: 38, severity: 'warning', text: 'Width trending −5 %' },
      { time: '14:01', layer: 41, severity: 'warning', text: 'Width below tolerance' },
      { time: '14:26', layer: 64, severity: 'warning', text: 'Interlayer delay 236 s' },
      { time: '15:01', layer: 98, severity: 'info', text: 'Material batch changed' },
    ],
    parameters: [
      { name: 'Pump speed', unit: 'RPM', start: 246, end: 262, min: 244, max: 262 },
      { name: 'Print speed', unit: 'mm/s', start: 104, end: 100, min: 100, max: 104 },
      { name: 'Material temperature', unit: '°C', start: 21.4, end: 26.2, min: 21.4, max: 26.5 },
      { name: 'Layer width', unit: 'mm', start: 39.6, end: 39.7, min: 36.6, max: 40.6 },
      { name: 'Interlayer delay', unit: 's', start: 108, end: 141, min: 104, max: 236 },
    ],
    adjustments: [
      { time: '13:41', by: 'dev', type: 'AI accepted', param: 'Print speed', from: '104', to: '100', unit: 'mm/s', note: 'Smoother corners on the return pass' },
      { time: '14:02', by: 'dev', type: 'AI accepted', param: 'Pump RPM', from: '246', to: '262', unit: 'RPM', note: 'Under-extrusion at layer 41' },
      { time: '14:33', by: 'dev', type: 'AI modified', param: 'Interlayer delay', from: '150', to: '140', unit: 's', note: 'AI proposed 135 s; kept margin for crew access' },
      { time: '14:48', by: 'dev', type: 'AI rejected', param: 'Pump RPM', from: '262', to: '254', unit: 'RPM', note: 'Sensor artifact: camera lens splash' },
      { time: '15:02', by: 'dev', type: 'Manual', param: 'Print speed', from: '100', to: '96', unit: 'mm/s', note: 'New batch slightly stiffer' },
      { time: '15:10', by: 'dev', type: 'AI accepted', param: 'Print speed', from: '96', to: '100', unit: 'mm/s', note: 'Batch settled' },
      { time: '15:14', by: 'dev', type: 'AI accepted', param: 'Pump RPM', from: '262', to: '258', unit: 'RPM', note: 'Width slightly above target' },
    ],
    summary: 'The print finished on schedule. One under-extrusion episode at layer 41 was corrected by a +16 RPM adjustment and width was back within tolerance by layer 44. No critical alerts were raised. AI predictions of layer width were within 0.7 mm on average (91 % accuracy).',
    exportFormats: ['CSV', 'JSON', 'PDF report'],
  },

  sessions: [
    { id: 'S-1009-01', job: 'Column C-12', printer: 'Arm-01', date: 'Oct 9', duration: '3 h 41 m', status: 'In progress', quality: null },
    { id: 'S-1008-02', job: 'Wall Panel WP-03', printer: 'Gantry-02', date: 'Oct 8', duration: '2 h 05 m', status: 'Completed', quality: 94 },
    { id: 'S-1008-01', job: 'Wall Panel WP-02', printer: 'Gantry-02', date: 'Oct 8', duration: '2 h 12 m', status: 'Completed', quality: 89 },
    { id: 'S-1007-02', job: 'Column C-11', printer: 'Arm-01', date: 'Oct 7', duration: '3 h 55 m', status: 'Completed', quality: 92 },
    { id: 'S-1007-01', job: 'Footing F-1', printer: 'Gantry-03', date: 'Oct 7', duration: '1 h 18 m', status: 'Stopped', quality: 71 },
  ],

  connection: {
    live: { text: 'Live', desktopText: 'All sensors live' },
    reconnecting: { text: 'Reconnecting…', buffered: 12, detail: '12 readings buffered, nothing lost' },
    offline: { text: 'Offline', buffered: 37, detail: '37 readings buffered' },
    restored: { text: 'Connection restored · 12 readings synced, no data lost' },
  },

  mfa: { digitsEntered: '482', expiresIn: '0:24' },

  onboarding: {
    targetMinutes: 3,
    checklist: { done: 3, total: 5, items: [
      { text: 'Secure your account (MFA)', done: true }, { text: 'Meet your dashboard', done: true }, { text: 'Practice hold-to-stop', done: true },
      { text: 'Watch your first live print', done: false }, { text: 'Acknowledge your first alert', done: false } ] },
    steps: ['Welcome', 'Your role', 'Connect printer', 'Tour'], // onboarding order (tour = step 4 of 4, ends with hold-to-stop practice)
    stopPracticeRingPct: 70,
    sensors: [
      { name: 'Thermocouple', detail: 'Material temperature', status: 'live', reading: '24.6 °C' },
      { name: 'Pump encoder', detail: 'Pump speed', status: 'live', reading: '246 RPM' },
      { name: 'Power meter', detail: 'Pump power', status: 'live', reading: '1.9 kW' },
      { name: 'Camera', detail: 'Bead geometry', status: 'calibrating', reading: 'Calibrating 70 %' },
    ],
    printerSteps: ['Printer', 'Sensors', 'Camera calibration', 'Test'],
  },

  nudges: {
    predictive: { style: 'ai', text: 'Heads-up: interlayer delay is predicted to reach 228 s in ~6 layers (limit 240 s).', action: 'Review AI suggestion' },
    unacknowledged: { style: 'warn', text: 'Layer width warning has been open for 30 s. Acknowledge or escalate?', actions: ['Acknowledge', 'Escalate'] },
    escalation: { style: 'neutral', text: 'Dev Patel (Engineer) was notified · usually responds in ~2 min.' },
    closure: { style: 'ok', text: 'Applied at layer 43. Width is recovering: 38.9 mm (+2.5 mm). Nice catch.' },
    handoff: { style: 'neutral', text: 'Shift ends in 10 min. Leave a hand-off note for the next operator?', action: 'Write note' },
    endOfPrint: { style: 'neutral', text: 'WP-03 finished: Quality 94 · 0 critical alerts · Report ready', action: 'Open report' },
    rules: ['Max 1 nudge visible', 'Auto-dismiss after 8 s', 'Never covers the control bar', 'Never during a critical alert', 'Mute any type in Settings'],
  },

  gamification: {
    qualityScore: { live: 91, shift: 94, formula: '% of layers within tolerance × alert-response factor × prediction-adoption factor',
      // 40/42 × 0.98 × 0.98 = 0.914 → 91 (layers 23 and 42 were out of tolerance)
      breakdown: [
        { label: 'Layers within tolerance', value: '40 of 42', factor: '95 %' },
        { label: 'Alert response', value: 'avg 11 s', factor: '× 0.98' },
        { label: 'AI suggestions reviewed', value: '1 pending', factor: '× 0.98' },
      ] },
    streak: { previous: 18, brokenAtLayer: 42, current: 0, afterRecovery: 6, milestones: [25, 50, 100] },
    shiftGoal: { text: 'Shift B goal: 3 prints with quality ≥ 90', done: 2, total: 3 },
    shiftSummary: { layersMonitored: 412, alertsHandled: 6, avgResponseSec: 11, defectsPrevented: 2, newBadge: 'First Catch' },
    badges: [
      { name: 'First Catch', icon: 'bell-ring', desc: 'Acknowledged an alert within 15 s', earned: true, earnedAt: 'today 14:31' },
      { name: 'Safety First', icon: 'octagon', desc: 'Completed hold-to-stop practice', earned: true, earnedAt: 'Oct 2' },
      { name: 'Calibrated', icon: 'scan', desc: 'Completed camera calibration', earned: true, earnedAt: 'Oct 5' },
      { name: 'Early Bird', icon: 'sunrise', desc: 'Flagged a predicted issue early', earned: true, earnedAt: 'Oct 7' },
      { name: 'Model Partner', icon: 'sparkles', desc: 'Reviewed 10 AI suggestions', earned: false, progress: 7, goal: 10 },
      { name: 'Steady Hands', icon: 'layers', desc: '100 consecutive clean layers', earned: false, progress: 64, goal: 100 },
    ],
  },

  _notes: [
    'ETA 02:05:00 is treated as time REMAINING (elapsed 01:12:40 at layer 42/120 = 35 % only works that way).',
    'Spec 05 S07 shows Width 38.1 mm with "trending −5 %" on the Dashboard; CLAUDE.md requires width 36.4 mm at layer 42 everywhere. Dashboard uses 36.4 / −9 %; −5 % is the 14:31 alert (A-311) at layer 40.',
    'Spec 05 S14 dates the WP-03 session report Oct 8 (2 h 05 m, 120/120 layers) but WP-03 is printing live on Oct 9 at layer 42. Kept as specified; team should decide (e.g., report WP-02, or show the Oct 9 report after completion).',
    'Spec 06 shows "Clean-print streak: 6 layers" on the Dashboard and "18-layer clean streak" elsewhere. Here: 18 layers ended at layer 42 (width out of tolerance); 6 layers after recovery.',
    'Spec 05 S11 Modify example types 258 RPM; the applied change (session summary "+16 RPM", nudge "applied at layer 43") is 262 RPM.',
    `Trends 1 h stats are computed from the series: min ${trendsStats.min}, max ${trendsStats.max}, avg ${trendsStats.avg}, σ ${trendsStats.sd} (spec example: 36.4 / 40.8 / 38.7 / 1.1).`,
    'Session adjustment log has 7 rows (spec KPI says 6 adjustments: 4 accepted, 1 modified, 1 manual); the 1 rejected recommendation is logged but is not an adjustment.',
  ],
};

fs.writeFileSync('src/data/mock.json', JSON.stringify(mock, null, 1).replace(/\n\s+(-?[\d.]+)(?=,?\n)/g, ' $1'));
console.log('mock.json written. Trends stats:', trendsStats, 'report MAE:', mae);
