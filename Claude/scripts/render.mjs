// Render every page to exports/*@2x.png (deviceScaleFactor 2, never upscaled) and the report to a Letter PDF.
// Usage: node scripts/render.mjs [filter]   e.g. `node scripts/render.mjs S08` renders only matching files.
// Based on plan/08_build_and_export.md §4. Pages load over a local http server (not file://) so they can fetch mock.json.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './serve.mjs';

const frames = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 768 },
  journey: { width: 1056, height: 816 }, // Letter landscape at 96 px/in (12 px = 9 pt in print); rendered at 3×
  sheet: { width: 1440, height: 900, fullPage: true }, // component sheet: full-page capture
  flow: { width: 1600, height: 920 }, // route diagram (src/lofi/flow.html)
  closeup: { width: 720, height: 450 }, // component close-ups for the report (e.g., S16c quality ring)
};
const SOURCES = ['src/screens', 'src/lofi', 'src/journey', 'src/brand', 'src/components.html'];
const filter = process.argv[2] || '';

// Playwright's bundled Chromium is not installed on every machine; fall back to the installed Chrome / Edge.
async function launch() {
  for (const opt of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) {
    try { return await chromium.launch(opt); } catch { /* try the next one */ }
  }
  throw new Error('No Chromium found (bundled, Chrome, or Edge).');
}

function listPages() {
  const out = [];
  for (const src of SOURCES) {
    if (!fs.existsSync(src)) continue;
    if (fs.statSync(src).isFile()) { out.push(src); continue; }
    for (const f of fs.readdirSync(src).sort()) if (f.endsWith('.html')) out.push(`${src}/${f}`);
  }
  return out.filter((p) => p.includes(filter));
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  // src/lib/mount.js sets window.__primePending while it renders charts / binds mock data.
  await page.waitForFunction(() => !window.__primePending, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
}

fs.mkdirSync('exports', { recursive: true });
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await launch();
const warnings = [];
let count = 0;

for (const rel of listPages()) {
  // 2× for screens; 3× for the journey map, which is printed as a full Letter page (~288 dpi)
  const dsf = rel.startsWith('src/journey') ? 3 : 2;
  const page = await browser.newPage({ deviceScaleFactor: dsf });
  page.on('pageerror', (e) => warnings.push(`${rel}: JS error: ${e.message}`));
  page.on('requestfailed', (r) => r.url().endsWith('favicon.ico') || warnings.push(`${rel}: failed to load ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) warnings.push(`${rel}: HTTP ${r.status()} ${r.url()}`); });
  page.on('console', (m) => { if ((m.type() === 'warning' || m.type() === 'error') && !m.text().includes('404')) warnings.push(`${rel}: ${m.text()}`); });
  await page.goto(base + rel, { waitUntil: 'networkidle' });
  const kind = (await page.getAttribute('body', 'data-frame')) || 'desktop';
  const frame = frames[kind] || frames.desktop;
  await page.setViewportSize({ width: frame.width, height: frame.height });
  await settle(page);
  if (!frame.fullPage) {
    // Content must fit the frame exactly: flag anything that overflows (would be clipped / scroll).
    const over = await page.evaluate(({ width, height }) => {
      const de = document.documentElement;
      const bad = [];
      if (de.scrollWidth > width || de.scrollHeight > height) bad.push(`page ${de.scrollWidth}x${de.scrollHeight}`);
      for (const el of document.querySelectorAll('body *')) {
        if (el.ownerSVGElement) continue; // SVG children are clipped by their <svg>
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > width + 0.5 || r.bottom > height + 0.5) && getComputedStyle(el).position !== 'fixed') {
          bad.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} @ ${Math.round(r.right)}x${Math.round(r.bottom)}`);
          if (bad.length > 4) break;
        }
      }
      return bad;
    }, frame);
    if (over.length) warnings.push(`${rel}: overflows ${frame.width}x${frame.height}: ${over.join('; ')}`);
  }
  const out = `exports/${path.basename(rel, '.html')}@${dsf}x.png`;
  await page.screenshot({ path: out, fullPage: !!frame.fullPage });
  console.log(`✓ ${out}  (${kind})`);
  count++;
  await page.close();
}

// Callouts: measure the elements named in src/report/callouts.spec.json → src/report/callouts.json (percent of frame)
async function measureCallouts() {
  const spec = JSON.parse(fs.readFileSync('src/report/callouts.spec.json', 'utf8'));
  const out = {};
  for (const [screen, sels] of Object.entries(spec)) {
    if (screen.startsWith('_')) continue;
    const page = await browser.newPage();
    await page.goto(base + `src/screens/${screen.split('#')[0]}.html`, { waitUntil: 'networkidle' });
    const kind = (await page.getAttribute('body', 'data-frame')) || 'desktop';
    const fr = frames[kind];
    await page.setViewportSize({ width: fr.width, height: fr.height });
    await settle(page);
    out[screen] = [];
    for (const sel of sels) {
      const box = await page.locator(sel).first().boundingBox().catch(() => null);
      if (!box) { warnings.push(`callouts: "${sel}" not found on ${screen}`); out[screen].push(null); continue; }
      // marker sits on the element's top-left corner, nudged outward
      out[screen].push({ x: +(100 * Math.max(0, box.x - 6) / fr.width).toFixed(2), y: +(100 * Math.max(0, box.y - 6) / fr.height).toFixed(2) });
    }
    await page.close();
  }
  fs.writeFileSync('src/report/callouts.json', JSON.stringify(out, null, 1));
  console.log('✓ src/report/callouts.json');
}

// Report PDF (Letter, vector text)
if (fs.existsSync('src/report/report.html') && (!filter || 'report'.includes(filter))) {
  await measureCallouts();
  const rp = await browser.newPage();
  await rp.goto(base + 'src/report/report.html', { waitUntil: 'networkidle' });
  await settle(rp);
  await rp.pdf({ path: 'exports/PRIME_Milestone2.pdf', format: 'Letter', printBackground: true, preferCSSPageSize: true });
  console.log('✓ exports/PRIME_Milestone2.pdf');
}

await browser.close();
server.close();
console.log(`\n${count} PNG(s) rendered.`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log('  ! ' + w);
  process.exitCode = 1;
}
