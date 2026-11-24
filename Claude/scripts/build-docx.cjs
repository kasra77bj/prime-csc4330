// Word report in the Milestone 1 format (exports/PRIME_Milestone2.docx):
// centered cover · numbered blue sections (1., 1.1) · justified body · centered page numbers · Contributions + Use of AI last.
// Figures come from exports/docx-assets (4× captures with callout markers; run build-docx-assets.mjs first).
// Run: npm run docx
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, AlignmentType,
  HeadingLevel, PageOrientation, PageBreak, Footer, PageNumber, TableLayoutType, VerticalAlign, LevelFormat,
} = require('docx');

const mock = JSON.parse(fs.readFileSync('src/data/mock.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('exports/docx-assets/manifest.json', 'utf8'));
const figs = Object.fromEntries(manifest.flatMap((p) => (p.blocks || []).flatMap((b) => b.figs || (b.type === 'fig' ? [b] : []))).map((f) => [f.screen, f]));
const coverLogo = manifest[0].logo;

const FONT = 'Aptos';
const C = { text: '1C1E21', muted: '5F6368', blue: '1F5F8B', blue7: '174A6D', border: 'BFBDB8', canvas: 'F5F4F1', brand50: 'E6EEF4' };
const DXA = 1440, W = 6.5; // 1 in margins → 6.5 in text width

// ---------- helpers ----------
const png = (file) => { const buf = fs.readFileSync(file); return { buf, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; };
const asset = (screen) => (figs[screen] ? `exports/docx-assets/${figs[screen].img}.png` : `exports/${screen}@2x.png`);
const image = (file, wIn, maxH) => {
  const { buf, w, h } = png(file); let iw = wIn, ih = (wIn * h) / w;
  if (maxH && ih > maxH) { ih = maxH; iw = (ih * w) / h; }
  return new ImageRun({ type: 'png', data: buf, transformation: { width: Math.round(iw * 96), height: Math.round(ih * 96) } });
};
const r = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || 22, bold: o.bold, italics: o.italic, color: o.color || C.text });
// body paragraph: justified like Milestone 1; accepts plain text or [text, {bold}] pieces
const P = (content, o = {}) => new Paragraph({
  children: (Array.isArray(content) ? content : [content]).map((c) => (typeof c === 'string' ? r(c, o) : c)),
  alignment: o.align || AlignmentType.JUSTIFIED, spacing: { after: o.after ?? 160, line: 276 }, keepNext: o.keepNext, indent: o.indent,
});
const B = (text) => r(text, { bold: true });
const H1 = (text, newPage = true) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: newPage, children: [r(text, { size: 32, bold: true, color: C.blue })], spacing: { before: 120, after: 200 }, keepNext: true });
const H2 = (text, newPage = false) => new Paragraph({ heading: HeadingLevel.HEADING_2, pageBreakBefore: newPage, children: [r(text, { size: 26, bold: true, color: C.blue })], spacing: { before: 240, after: 120 }, keepNext: true });
const bullet = (content) => new Paragraph({ numbering: { reference: 'dots', level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 276 },
  children: (Array.isArray(content) ? content : [content]).map((c) => (typeof c === 'string' ? r(c) : c)) });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
const thin = { style: BorderStyle.SINGLE, size: 4, color: C.border };
const allThin = { top: thin, bottom: thin, left: thin, right: thin };

let figNo = 0;
function caption(text) {
  figNo++;
  const [title, ...rest] = text.split(' · ');
  return new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 60, after: 40 }, children: [
    r(`Figure ${figNo}. `, { size: 18, bold: true, color: C.blue }), r(title, { size: 18, bold: true }), r(rest.length ? ' · ' + rest.join(' · ') : '', { size: 18, color: C.muted })] });
}
function legend(items) {
  return items.map((t, i) => new Paragraph({ spacing: { after: 20 }, children: [r(`(${i + 1}) `, { size: 18, bold: true }), r(t.replace(/^\d+\s*/, ''), { size: 18 })] }));
}
function fig(screen, wIn = 5.5, o = {}) { // full-width figures at 5.5 in so text + figure + a pair fit on one page
  const f = figs[screen] || {};
  return [new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { after: 0 }, children: [image(asset(screen), wIn, o.maxH)] }),
    caption(o.caption || f.caption || screen), ...legend(o.legend ?? f.legend ?? []), new Paragraph({ spacing: { after: 120 }, children: [] })];
}
function figPair(a, b) {
  const col = (W * DXA - 300) / 2;
  const cell = (s) => new TableCell({ width: { size: col, type: WidthType.DXA }, borders: noBorders, children: fig(s, col / DXA) });
  return new Table({ width: { size: W * DXA, type: WidthType.DXA }, columnWidths: [col, 300, col], layout: TableLayoutType.FIXED, borders: noBorders,
    rows: [new TableRow({ cantSplit: true, children: [cell(a), new TableCell({ width: { size: 300, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph({ children: [] })] }), cell(b)] })] });
}
function table(headers, rows, widthsIn, o = {}) {
  const widths = widthsIn.map((w) => Math.round(w * DXA));
  const cell = (content, i, head) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA }, borders: allThin, verticalAlign: VerticalAlign.CENTER,
    shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: C.brand50 } : content?.swatch ? { type: ShadingType.CLEAR, color: 'auto', fill: content.swatch } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ spacing: { after: 0 }, children: content?.swatch ? [] : (Array.isArray(content) ? content : [r(String(content ?? ''), { size: o.size || 18, bold: head, color: head ? C.blue7 : C.text, italic: /^\[.*\]$/.test(String(content)) })]) })],
  });
  return new Table({ width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }), ...rows.map((row) => new TableRow({ cantSplit: true, children: row.map((c, i) => cell(c, i, false)) }))] });
}
function placeholder(lines, hIn) {
  const dash = { style: BorderStyle.DASHED, size: 8, color: C.border };
  return new Table({ width: { size: W * DXA, type: WidthType.DXA }, columnWidths: [W * DXA], rows: [new TableRow({ height: { value: hIn * DXA, rule: 'atLeast' }, children: [
    new TableCell({ width: { size: W * DXA, type: WidthType.DXA }, borders: { top: dash, bottom: dash, left: dash, right: dash }, verticalAlign: VerticalAlign.CENTER,
      children: lines.map((l, i) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [r(l, { size: i ? 18 : 20, bold: !i, color: i ? C.muted : C.text })] })) })] })] });
}
const gap = () => new Paragraph({ spacing: { after: 120 }, children: [] });

// ---------- cover (Milestone 1 layout) ----------
const cover = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 500 }, children: [image(`exports/docx-assets/${coverLogo}.png`, 3.0)] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160, line: 300 }, children: [r('PRIME: Process Real-time Intelligence for Manufacturing Excellence', { size: 40, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 900 }, children: [r('Milestone II: UI/UX Design', { size: 26, color: C.blue })] }),
  new Paragraph({ spacing: { after: 160 }, children: [r('Team:', { bold: true })] }),
  new Paragraph({ spacing: { after: 160 }, children: [r('Kasra Banijamali', { italic: true })] }),
  new Paragraph({ spacing: { after: 1400 }, children: [r('Carlos Manosalvas', { italic: true })] }),
  ...['Professor: Dr. Nash Mahmoud', 'CSC 4330 – Milestone #2', 'Fall 2026', 'Figma: [link added after import]'].map((t) =>
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [r(t, { size: 18, color: t.startsWith('Figma') ? C.muted : C.text })] })),
];

// ---------- 1 · Color palette ----------
const palette = [
  ['canvas', '#F5F4F1', 'Neutral', 'App background', 'Warm off-white like cured concrete; softer than pure white over long shifts.'],
  ['surface', '#FFFFFF', 'Neutral', 'Cards, panels, modals', 'Lifts content off the canvas with very little shadow.'],
  ['border', '#DCD9D3', 'Neutral', 'Dividers, chart grid, disabled fills', 'Quiet warm-gray structure; never used for text.'],
  ['text', '#1C1E21', 'Neutral', 'Primary text and live values', '15.2:1 on canvas; large readings stay legible from about 2 m.'],
  ['text-muted', '#5F6368', 'Neutral', 'Units, ranges, captions, placeholders', '6.1:1 on white, so secondary text still passes WCAG AA.'],
  ['charcoal', '#23272B', 'Neutral', 'Sidebar, coach marks, toasts', 'Dark industrial frame that keeps blue free for actions.'],
  ['brand-600', '#1F5F8B', 'Brand & interaction', 'Primary buttons, links, selected tab, focus', 'Steel blue from the logo; the single “you can act here” color (6.8:1 with white).'],
  ['brand-700', '#174A6D', 'Brand & interaction', 'Hover / pressed, headings, logo', 'Darker step of the same hue for state feedback and hierarchy.'],
  ['brand-50', '#E6EEF4', 'Brand & interaction', 'Selected rows, AI cards, chart target band', 'Light tint keeps selection and AI advice calm and informational.'],
  ['critical', '#C62828', 'Status', 'Out of range, sensor lost, STOP button', 'Red means danger/stop (ANSI Z535, ISO 3864); reserved so it is never ignored.'],
  ['critical-50', '#FDECEA', 'Status', 'Critical banner and card background', 'Tint lets red text sit on it at 4.9:1.'],
  ['ok', '#2E7D32', 'Status', 'In range, connected, success, badges', 'Deep green that passes AA; shown small (a dot), never as big fills.'],
  ['ok-50', '#E8F5E9', 'Status', 'Success toast, “decision applied”', 'Soft confirmation that does not compete with alerts.'],
  ['warn-50', '#FBF3E4', 'Status (derived)', 'Warning banner and card background', 'Light tint of ochre so warnings have a background; our one addition.'],
  ['viz-teal', '#3C665E', 'Data visualization', 'Second measured series; quality ring; height', 'Muted gray-blue green, distinct from status green.'],
  ['viz-violet', '#7E57A6', 'Data visualization', 'AI predictions (dashed), confidence, width', 'No status meaning, so “prediction” reads instantly and never looks like an alarm.'],
  ['viz-ochre', '#B7791F', 'Data visualization', 'Third series; warning zones, icons, borders', 'Earthy “caution” tone; only 3.6:1 on white, so never used for text.'],
];
const sec1 = [
  H1('1. Color Palette'),
  P('Our palette has sixteen colors from the team’s Figma frame plus one derived warning tint. Most of the interface is warm gray and white; saturated color only appears when someone needs to act. Table 1 lists every color with where it is used and why it was chosen.'),
  new Paragraph({ spacing: { after: 80 }, keepNext: true, children: [r('Table 1. ', { size: 18, bold: true, color: C.blue }), r('Color palette, roles and justification', { size: 18, bold: true })] }),
  table(['', 'Token · Hex', 'Group', 'Where it is used', 'Why'],
    palette.map(([t, h, g, use, why]) => [{ swatch: h.slice(1) }, [r(t, { size: 17, bold: true }), new TextRun({ break: 1 }), r(h, { size: 16, color: C.muted })], g, use, why].map((c) => (typeof c === 'string' ? [r(c, { size: 17 })] : c))),
    [0.45, 1.15, 1.05, 1.75, 2.1]),
  gap(),
  H2('1.1. Design principles behind the colors'),
  bullet([B('Calm until it matters. '), r('Following the ISA-101 “high-performance HMI” idea used in control rooms, the normal state is neutral; color appears only for warnings and critical states, so it is never ignored.')]),
  bullet([B('Blue means “you can act here.” '), r('Brand blue is reserved for buttons, links, tabs and focus. Structural surfaces use charcoal.')]),
  bullet([B('AI advises, people decide. '), r('AI predictions are always violet and dashed, so a model suggestion is never confused with a measured value or an alarm.')]),
  bullet([B('Never color alone. '), r('Every status pairs a color with an icon and a text label, which keeps our red/green pair readable for people with color-vision deficiency (about 8 % of men).')]),
  P([B('Accessibility. '), r('All text and background pairs were checked against WCAG 2.1 AA. Because ochre fails text contrast on white, warning text is always dark text on the warn-50 tint.')]),
];

// ---------- 2 · Lo-fi ----------
const sec2 = [
  H1('2. Lo-Fi Wireframes and Navigation Routes'),
  H2('2.1. Paper sketch session'),
  P('We sketched the seven main screens together on paper (Login and two-factor, Dashboard, Live Print Monitor, Vision, Trends, AI Recommendations and Session Report), laid them out in flow order and drew the routes between them.'),
  placeholder(['Team photo with the paper sketches', 'Paper lo-fi session · Oct 10, 2026 · to be added by the team'], 2.0),
  gap(),
  H2('2.2. Digital wireframes and routes'),
  P('We redrew the sketches digitally so every route stays readable. Each arrow is labelled with the action that triggers it; dashed arrows are restricted by role. Screens inside a live print share a fixed control bar (Pause, Resume, Hold-to-STOP).'),
  ...fig('flow', 5.8, { caption: 'Navigation routes · the 7 main screens · dashed = role-restricted (Engineer / Manager)' }),
];

// ---------- 3 · Hi-Fi ----------
const sec3 = [
  H1('3. Hi-Fi Prototype'),
  P('The Hi-Fi screens were built at 1440 × 900 and imported into Figma, where they are linked into a clickable prototype (link on the cover and in Section 8). Every screen uses the same palette, the same sidebar, and the same numbers for the same moment of the demo print: Wall Panel WP-03 on Gantry-02 at layer 42, with the layer width at 36.4 mm (9 % under target). Numbered markers on each figure match the notes below it.'),
  H2('3.1. Sign in: Login and two-factor verification (US-01)'),
  P('Users sign in with their work email and password, then confirm with a 6-digit code from an authenticator app. The form is a single centered column under the logo. “Remember this device for 30 days” reduces how often operators wearing gloves need to type codes, and the large code boxes and visible timer make the second step quick.'),
  figPair('S01-login', 'S02-mfa'),
  H2('3.2. Home: Dashboard (US-03, 04, 06)', true),
  P('After signing in, users land on the Dashboard. Four summary cards show active prints, open alerts, AI suggestions waiting and the shift quality score. Below them, each printer has one card with its progress and key readings. Only the printer that needs attention (Gantry-02, width −9 %) uses warning color; everything else stays neutral.'),
  ...fig('S07-dashboard'),
  H2('3.3. Core feature: Live Print Monitor and Vision (US-03 to US-07)', true),
  P('The Live Print Monitor is where operators spend their shift. Each card shows a live value, its normal range and the last ten readings drawn between the lower and upper limits. A warning banner explains the problem in plain words. The control bar with Pause, Resume and a hold-to-stop button stays in the same place on every print screen. Vision shows the camera view with the measured width and height drawn on the bead, so the operator can confirm a reading is real or flag a camera glitch.'),
  ...fig('S08-live-monitor'),
  figPair('S09-vision', 'S08c-hold-to-stop'),
  H2('3.4. Core feature: AI Recommendations, Trends and Session Report (US-08 to US-13)', true),
  P('Engineers review AI suggestions on one screen: the suggested change, the predicted effect on a chart, the reasons in plain language and the risk, followed by Accept, Modify or Reject. Every decision, including manual changes made without AI, is logged. Trends lets anyone graph any signal over a chosen window. Managers and engineers can open a Session Report with key results, an AI-written summary and exports in CSV, JSON or PDF.'),
  ...fig('S11-ai-recommendations', 4.9),
  figPair('S14-session-report', 'S10-trends'),
];

// ---------- 4 · Onboarding ----------
const sec4 = [
  H1('4. Onboarding'),
  P('The first sign-in takes about three minutes and can be skipped or resumed at any time. It is designed so a new operator can use the system confidently before their first print (NFR Usability).'),
  bullet([B('Welcome: '), r('three short benefits and a progress indicator (step 1 of 4).')]),
  bullet([B('Your role: '), r('explains what the user can do and what needs an engineer, before they ever meet a locked button (step 2 of 4, NFR Security).')]),
  bullet([B('Connect printer: '), r('confirms every sensor is live before the first print (step 3 of 4).')]),
  bullet([B('Guided tour: '), r('coach marks over the real Live Monitor, ending with a safe practice of hold-to-stop (step 4 of 4).')]),
  ...fig('S05-tour', 5.5, { maxH: 2.9 }),
  figPair('S03-welcome', 'S04-role'),
];

// ---------- 5 · Nudges and gamification ----------
const nudgeRows = [
  ['Predictive heads-up', 'AI predicts a value will leave its range within a few layers', mock.nudges.predictive.text, 'AI (violet)'],
  ['Unacknowledged alert', 'A warning stays open for more than 30 s', mock.nudges.unacknowledged.text, 'Warning (ochre)'],
  ['Escalation receipt', 'The operator escalates to an engineer', mock.nudges.escalation.text, 'Neutral'],
  ['Decision closure', 'An engineer accepted an AI change', mock.nudges.closure.text, 'Success (green)'],
  ['Shift hand-off', '10 minutes before the shift ends', mock.nudges.handoff.text, 'Neutral'],
  ['End of print', 'A print completes', mock.nudges.endOfPrint.text, 'Neutral'],
];
const badgeRows = mock.gamification.badges.map((b) => [b.name, b.desc, b.earned ? `Earned (${b.earnedAt})` : `Locked · ${b.progress}/${b.goal}`]);
const q = mock.gamification.qualityScore;
const sec5 = [
  H1('5. Nudges and Gamification'),
  P('PRIME uses small, well-timed prompts (nudges) and light gamification to build good habits on the print floor. Because printing is safety-critical, both follow strict rules: they reward attention and quality, never speed, and they never get in the way of the controls.'),
  H2('5.1. Design rules'),
  bullet('Only one nudge is visible at a time, and it disappears after 8 seconds.'),
  bullet('Nudges never cover the control bar and never appear during a critical alert.'),
  bullet('Every nudge type can be muted in Settings.'),
  bullet('Goals are shared by the team; there is no individual leaderboard, which avoids a blame culture on a safety-critical floor.'),
  H2('5.2. Nudges'),
  P('Each nudge has a clear trigger and plain-language text. Table 2 lists all six; Figure ' + (figNo + 1) + ' shows two of them on the Live Monitor (all six are in the Appendix).'),
  new Paragraph({ spacing: { after: 80 }, keepNext: true, children: [r('Table 2. ', { size: 18, bold: true, color: C.blue }), r('Nudges, triggers and messages', { size: 18, bold: true })] }),
  table(['Nudge', 'When it appears', 'Message', 'Style'], nudgeRows, [1.25, 1.65, 2.6, 1.0]),
  gap(),
  ...fig('nudges-pair', W, { caption: 'Nudges on the Live Monitor · a predictive heads-up and a decision closure, shown above the controls · US-06, 09', legend: [] }),
  H2('5.3. Gamification', true),
  P([B('Print quality score. '), r(`Every print gets a score from 0 to 100, shown as a ring on the Live Monitor and on reports. The formula is explained to users instead of hidden: ${q.formula}. For the demo print this is 40 of 42 layers in tolerance (95 %) × 0.98 × 0.98 = ${q.live}.`)]),
  P([B('Clean-print streak. '), r(`The number of consecutive layers within all tolerances (best this shift: ${mock.gamification.streak.previous} layers), with small milestones at 25, 50 and 100 layers.`)]),
  P([B('Badges. '), r('Badges reward good habits such as fast acknowledgement, safety practice and reviewing AI suggestions (Table 3). Locked badges show progress so the next step is always clear.')]),
  P([B('Team goal and shift summary. '), r(`A shared shift goal (“${mock.gamification.shiftGoal.text}”, currently ${mock.gamification.shiftGoal.done}/${mock.gamification.shiftGoal.total}) and an end-of-shift summary (layers monitored, alerts handled, average response time, defects prevented) keep the focus on the team’s results.`)]),
  new Paragraph({ spacing: { after: 80 }, keepNext: true, children: [r('Table 3. ', { size: 18, bold: true, color: C.blue }), r('Badges', { size: 18, bold: true })] }),
  table(['Badge', 'How it is earned', 'Status (Maya Ortiz)'], badgeRows, [1.5, 3.3, 1.7]),
  gap(),
  figPair('S16-achievements', 'S16c-quality-score'),
];

// ---------- 6 · Journey (landscape) ----------
const sec6 = [
  H1('6. User Journey Map (Bonus)', false),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [image('exports/journey-map@3x.png', 9.5, 6.85)] }),
];

// ---------- 7 · Traceability, 8 · Figma, 9 · Contributions ----------
const trace = [['US-01', 'Login + 2-factor', 'Login, two-factor'], ['US-02', 'Create users, assign roles', 'Admin › Users, Create user, Your role'],
  ['US-03', 'Live temperature', 'Dashboard, Live Monitor'], ['US-04', 'Print speed + nozzle size', 'Dashboard, Live Monitor'],
  ['US-05', 'Camera with width/height overlay', 'Vision'], ['US-06', 'Out-of-range alert', 'Dashboard, Live Monitor, Alerts'],
  ['US-07', 'Pause / resume / stop always reachable', 'All print screens, Hold to stop, Tour'], ['US-08', 'Graph any value over a time window', 'Trends'],
  ['US-09', 'AI proposes a change with a reason', 'AI Recommendations'], ['US-10', 'Accept / modify / reject', 'AI Recommendations, Operator view'],
  ['US-11', 'Manual change logged separately', 'Manual adjustment'], ['US-12', 'Download session data', 'Session Report'], ['US-13', 'Generated summary report', 'Session Report']];
const sec7 = [
  H1('7. User Story Traceability'),
  P('Every user story from Milestone 1 appears in at least one Hi-Fi screen.'),
  table(['Story', 'What it needs', 'Screens'], trace, [0.8, 2.6, 3.1]),
  gap(),
  H1('8. Figma Prototype', false),
  P([B('Figma file: '), r('[link added after import]', { italic: true, color: C.muted })]),
  P([B('Clickable prototype: '), r('[link added after import]', { italic: true, color: C.muted })]),
  H1('9. Contributions', false),
  P([B('Kasra Banijamali: '), r('[to be written by the team]', { italic: true, color: C.muted })]),
  P([B('Carlos Manosalvas: '), r('[to be written by the team]', { italic: true, color: C.muted })]),
  H2('9.1. Use of AI'),
  P(r('[to be written by the team: which tools were used, for what, and how the team reviewed and approved the results]', { italic: true, color: C.muted })),
];

// ---------- Appendix ----------
const appendix = [
  H1('Appendix: Additional Screens'),
  ...fig('S16b-nudges', 5.8, { caption: 'All six nudges · on the Live Monitor · US-06, 07, 09', legend: [] }),
  figPair('S12-alerts', 'S11b-manual-adjust'),
  new Paragraph({ pageBreakBefore: true, children: [] }),
  figPair('S15-admin-users', 'S15b-create-user'),
  figPair('S08b-live-reconnecting', 'S11c-operator-locked'),
  figPair('S06-connect-printer', 'S07b-dashboard-checklist'),
];

// ---------- document ----------
const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: C.muted })] })] });
const portrait = { page: { size: { width: 12240, height: 15840 }, margin: { top: DXA, bottom: DXA, left: DXA, right: DXA } } };
const doc = new Document({
  creator: 'Kasra Banijamali, Carlos Manosalvas', title: 'PRIME · Milestone II · UI/UX Design',
  numbering: { config: [{ reference: 'dots', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  styles: { default: { document: { run: { font: FONT, size: 22, color: C.text } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 32, bold: true, color: C.blue }, paragraph: { outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 26, bold: true, color: C.blue }, paragraph: { outlineLevel: 1 } },
    ] },
  sections: [
    { properties: { ...portrait, titlePage: true }, footers: { default: footer, first: new Footer({ children: [] }) }, children: [...cover, ...sec1, ...sec2, ...sec3, ...sec4, ...sec5] },
    { properties: { page: { size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, footers: { default: footer }, children: sec6 },
    { properties: portrait, footers: { default: footer }, children: [...sec7, ...appendix] },
  ],
});
Packer.toBuffer(doc).then((buf) => {
  // if a copy is open in Word (locked), save under the next free name instead of failing
  const names = ['exports/PRIME_Milestone2.docx', ...Array.from({ length: 20 }, (_, i) => `exports/PRIME_Milestone2 (${i + 2}).docx`)];
  let out;
  for (const n of names) {
    try { fs.writeFileSync(n, buf); out = n; break; } catch (e) { if (e.code !== 'EBUSY') throw e; }
  }
  if (!out) throw new Error('All report file names are open in Word; close one and re-run.');
  console.log(`✓ ${out} (${(buf.length / 1048576).toFixed(1)} MB)`);
});
