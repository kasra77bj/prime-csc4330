// T3.3 consistency checker (plan/09 Phase 3). Loads every screen in a browser and checks that shared parts and
// shared numbers match, then writes exports/consistency-report.md. Run: npm run consistency (after npm run render).
import { chromium } from 'playwright';
import fs from 'node:fs';
import { startServer } from './serve.mjs';

const mock = JSON.parse(fs.readFileSync('src/data/mock.json', 'utf8'));
const TOKENS = new Set(['#F5F4F1', '#FFFFFF', '#DCD9D3', '#1C1E21', '#5F6368', '#23272B', '#1F5F8B', '#174A6D', '#E6EEF4', '#C62828', '#FDECEA',
  '#2E7D32', '#E8F5E9', '#FBF3E4', '#3C665E', '#7E57A6', '#B7791F']);
const PEOPLE = ['Maya Ortiz', 'Dev Patel', 'Sam Lee', 'Jordan Brooks'];
const PRINT = /^S(05|08|09|10|11)/;            // /prints/:jobId/* screens → identical control bar
const NOW_MOMENT = /^S(07|08|09|11|12)/;       // the 14:34 / layer 42 moment
const frames = { desktop: [1440, 900], tablet: [1024, 768], closeup: [720, 450] };

const files = fs.readdirSync('src/screens').filter((f) => f.endsWith('.html')).sort();
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/`;
let browser;
for (const opt of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) { try { browser = await chromium.launch(opt); break; } catch {} }

const checks = []; // { area, screen, ok, detail }
const add = (area, screen, ok, detail = '') => checks.push({ area, screen, ok, detail });
const shared = { control: new Map(), sidebar: new Map() };

for (const f of files) {
  const id = f.replace('.html', '');
  const src = fs.readFileSync(`src/screens/${f}`, 'utf8');
  const page = await browser.newPage();
  const consoleWarn = [];
  page.on('console', (m) => { if (m.type() === 'warning' && m.text().includes('data-bind')) consoleWarn.push(m.text()); });
  await page.goto(base + `src/screens/${f}`, { waitUntil: 'networkidle' });
  const kind = (await page.getAttribute('body', 'data-frame')) || 'desktop';
  if (frames[kind]) await page.setViewportSize({ width: frames[kind][0], height: frames[kind][1] });
  await page.waitForFunction(() => !window.__primePending, null, { timeout: 15000 });

  const info = await page.evaluate(() => {
    // compare structure, not state: drop comments, the STOP hold progress/label, and the active/lock markers
    const norm = (el) => el ? el.outerHTML.replace(/<!--.*?-->/g, '').replace(/<small>.*?<\/small>/g, '').replace(/<circle[^>]*stroke-dasharray[^>]*>(<\/circle>)?/g, '')
      .replace(/ style="box-shadow:[^"]*"/g, '').replace(/\s+/g, ' ').replace(/ (nav-item-active|tab-dark-active)/g, '').replace(/<i data-lucide="lock"[^>]*><\/i>|<svg data-lucide="lock".*?<\/svg>/g, '') : null;
    return {
      control: norm(document.querySelector('footer.control-bar')),
      sidebar: norm(document.querySelector('aside.sidebar')),
      text: document.body.innerText,
      clock: document.querySelector('[data-bind="meta.clock"], [data-bind="trends.clock"]')?.textContent || null,
      role: document.querySelector('.role-badge')?.textContent || null,
    };
  });

  // 1 · header comment
  add('Header comment', id, /^<!doctype html>\s*<!-- S\d+[a-z]? · /i.test(src), 'first line comment “S## · Name · route · US-…”');
  // 2 · numbers bound to mock.json match
  add('Numbers = mock.json', id, consoleWarn.length === 0, consoleWarn.join('; '));
  // 3 · colors: inline hex codes must be tokens
  const hex = [...new Set((src.replace(/<svg data-lucide[\s\S]*?<\/svg>/g, '').match(/#[0-9A-Fa-f]{6}\b/g) || []).map((h) => h.toUpperCase()))].filter((h) => !TOKENS.has(h));
  add('Only palette colors', id, hex.length === 0, hex.join(', '));
  // 4 · copy: no lorem / emoji; only the four people
  const emoji = info.text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u);
  add('Real copy (no lorem, no emoji)', id, !/lorem|ipsum/i.test(info.text) && !emoji, emoji ? `emoji ${emoji[0]}` : '');
  const names = (info.text.match(/\b[A-Z][a-z]+ (?:Ortiz|Patel|Lee|Brooks|[A-Z][a-z]+son)\b/g) || []).filter((n) => !PEOPLE.includes(n));
  add('Only Maya / Dev / Sam / Jordan', id, names.length === 0, names.join(', '));
  // 5 · the 14:34 moment shows the same values
  if (NOW_MOMENT.test(id)) {
    const need = ['36.4'];
    if (/^S0[89]/.test(id)) need.push('42');
    const miss = need.filter((v) => !info.text.includes(v));
    add('Same moment, same values (width 36.4 · layer 42)', id, miss.length === 0, miss.length ? `missing ${miss}` : '');
    if (info.clock) add('Clock 14:34 on the “now” screens', id, info.clock === mock.meta.clock, info.clock);
  }
  // 6 · shared parts
  if (PRINT.test(id)) { add('Control bar present on print screens', id, !!info.control); if (info.control) shared.control.set(id, info.control); }
  if (info.sidebar) shared.sidebar.set(id, info.sidebar);
  await page.close();
}

const identical = (map, area) => {
  const groups = new Map();
  for (const [id, html] of map) groups.set(html, [...(groups.get(html) || []), id]);
  const [main] = [...groups.values()].sort((a, b) => b.length - a.length);
  for (const [id] of map) add(area, id, main.includes(id), main.includes(id) ? '' : `differs from ${main[0]}`);
};
identical(shared.control, 'Control bar identical');
identical(shared.sidebar, 'Sidebar identical (same items, order)');

await browser.close();
server.close();

// ---------- report ----------
const areas = [...new Set(checks.map((c) => c.area))];
const fails = checks.filter((c) => !c.ok);
let md = `# Consistency report · PRIME Milestone II\n\nGenerated by \`scripts/consistency.mjs\` on ${new Date().toISOString().slice(0, 10)} across ${files.length} screens.\n\n`;
md += `**Result: ${fails.length ? `${fails.length} issue(s)` : 'all checks pass'}** (${checks.length} checks).\n\n| Check | Screens checked | Result |\n|---|---|---|\n`;
for (const a of areas) {
  const cs = checks.filter((c) => c.area === a), bad = cs.filter((c) => !c.ok);
  md += `| ${a} | ${cs.length} | ${bad.length ? `✗ ${bad.map((c) => `${c.screen}${c.detail ? ` (${c.detail})` : ''}`).join('; ')}` : '✓'} |\n`;
}
md += `\n## Intentional differences (not errors)\n
- **Trends (S10) shows 14:36 / layer 43**, two minutes after the other screens, so it can show the pump change and the AI prediction. All its numbers come from the same data series.
- **Session Report (S14) is a different print** (WP-03, Oct 8, completed). Its numbers come from \`mock.json → session\`.
- **Roles change only lock icons** in the sidebar (Admin locked for non-admins, Sessions locked for Operators). Items and order are identical everywhere.
- **No sidebar on S01/S02** (not signed in yet) or on S16b/S16c (report figures, not app pages).
- **STOP state differs on purpose**: S08c shows the hold in progress (70 %) and S05 shows the practice state; the bar itself is identical.
- **Variants are generated from their parent screen** (S08b/c from S08, S11b/c from S11, S15b from S15, S05 and S07b from S08/S07), so shared parts cannot drift.
\n## Open spec questions for the team\n\n${mock._notes.map((n) => `- ${n}`).join('\n')}\n`;
fs.writeFileSync('exports/consistency-report.md', md);
console.log(md.split('\n## Intentional')[0]);
process.exitCode = fails.length ? 1 : 0;
