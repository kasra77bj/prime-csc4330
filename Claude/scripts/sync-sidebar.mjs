// Stamps the canonical sidebar (scripts/lib/shell.mjs) into every signed-in screen, replacing any older sidebar
// or tablet rail, so all pages show the same options. Runs as part of npm run render (before icons).
// Not applied to: S01/S02 (not signed in yet), S16b/S16c (report boards/close-ups, not app pages).
import fs from 'node:fs';
import { sidebar } from './lib/shell.mjs';

const ACTIVE = { S03: null, S04: null, S06: null, S05: 'live', S07: 'dashboard', S08: 'live', S09: 'live', S10: 'live', S11: 'live',
  S12: 'alerts', S14: 'sessions', S15: 'admin', S16: 'achievements' };
const SKIP = /^(S01|S02|S16b|S16c)/;
const BLOCK = /(?:<!-- (?:SIDEBAR|SIDE RAIL)[^\n]*-->\n)?<aside class="(?:sidebar|rail)">[\s\S]*?<\/aside>/;

let n = 0;
for (const f of fs.readdirSync('src/screens').filter((f) => f.endsWith('.html')).sort()) {
  if (SKIP.test(f)) continue;
  const id = f.slice(0, 3);
  if (!(id in ACTIVE)) { console.warn(`  ? ${f}: no sidebar mapping`); continue; }
  const p = `src/screens/${f}`;
  const html = fs.readFileSync(p, 'utf8');
  const role = (html.match(/<span class="role-badge">(\w+)<\/span>\s*<span class="avatar">/) || [])[1] || 'Engineer';
  if (!BLOCK.test(html)) { console.warn(`  ? ${f}: no sidebar found`); continue; }
  const out = html.replace(BLOCK, sidebar(ACTIVE[id], role));
  if (out !== html) { fs.writeFileSync(p, out); n++; }
}
console.log(`Sidebar synced in ${n} file(s).`);
