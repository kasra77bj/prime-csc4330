// Step 1 of the Word export: opens the finished report (src/report/report.html) and
//  - screenshots every figure at 4× (callout markers included) → exports/docx-assets/*.png
//  - records the page content in reading order → exports/docx-assets/manifest.json
// Step 2 (scripts/build-docx.cjs) turns the manifest into exports/PRIME_Milestone2.docx.
// Run: npm run docx
import { chromium } from 'playwright';
import fs from 'node:fs';
import { startServer } from './serve.mjs';

const OUT = 'exports/docx-assets';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const server = await startServer();
let browser;
for (const opt of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) { try { browser = await chromium.launch(opt); break; } catch {} }
// viewport = printed content width (8.5 in − 2 × 0.6 in = 7.3 in = 701 px) so figures lay out exactly as in the PDF
const page = await browser.newPage({ deviceScaleFactor: 4, viewport: { width: 701, height: 1400 } });
await page.goto(`http://127.0.0.1:${server.address().port}/src/report/report.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !window.__primePending, null, { timeout: 30000 });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: '.pfoot{display:none!important} .page{height:auto!important;overflow:visible!important}' }); // footers must not bleed into figure captures

// Tag every element we will screenshot, and describe the pages in reading order.
const manifest = await page.evaluate(() => {
  let n = 0;
  const tag = (el) => { const id = `img${String(++n).padStart(2, '0')}`; el.setAttribute('data-shot', id); return id; };
  const text = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim();
  const pages = [];
  for (const sec of document.querySelectorAll('section.page')) {
    const p = { kind: sec.classList.contains('cover') ? 'cover' : sec.classList.contains('landscape') ? 'landscape' : 'page', blocks: [] };
    if (p.kind === 'cover') {
      const imgs = sec.querySelectorAll('img');
      p.logo = tag(imgs[0]); p.hero = tag(sec.querySelector('.shot'));
      p.title = text(sec.querySelector('h1'));
      p.subtitle = text(sec.querySelector('h1').nextElementSibling);
      p.lines = [...sec.querySelectorAll('div[style*="line-height:1.7"] > div')].map(text);
      pages.push(p); continue;
    }
    if (p.kind === 'landscape') { pages.push(p); continue; } // Word uses exports/journey-map@3x.png directly
    p.title = text(sec.querySelector('.rh1'));
    p.number = text(sec.querySelector('.pfoot span:last-child'));
    const seen = new Set();
    for (const el of sec.querySelectorAll('p.lead, p.todo, .slot, .rh2, figure.fig, table.tbl, .pal-card, .principle, .banner')) {
      if ([...seen].some((s) => s.contains(el))) continue;
      if (el.matches('.pal-card')) {
        seen.add(el);
        p.blocks.push({ type: 'palette', group: text(el.querySelector('.group-title')), swatches: [...el.querySelectorAll('.sw')].map((sw) => ({
          token: text(sw.querySelector('.t')), hex: text(sw.querySelector('.hex')), role: text(sw.querySelector('.r')) })) });
      } else if (el.matches('.principle')) {
        p.blocks.push({ type: 'principle', bold: text(el.querySelector('b')), text: text(el).replace(text(el.querySelector('b')), '').trim() });
      } else if (el.matches('.banner')) {
        p.blocks.push({ type: 'note', text: text(el) });
      } else if (el.matches('p.lead, p.todo')) {
        p.blocks.push({ type: 'p', text: text(el), italic: el.matches('.todo') });
      } else if (el.matches('.rh2')) {
        p.blocks.push({ type: 'h2', text: text(el) });
      } else if (el.matches('.slot')) {
        p.blocks.push({ type: 'slot', lines: el.innerText.split('\n').map((s) => s.trim()).filter(Boolean) });
      } else if (el.matches('table.tbl')) {
        p.blocks.push({ type: 'table', rows: [...el.rows].map((r) => [...r.cells].map(text)) });
      } else if (el.matches('figure.fig')) {
        const row = el.parentElement.querySelectorAll(':scope > figure.fig').length > 1 ? el.parentElement : null;
        const fig = { type: 'fig', screen: el.querySelector('.shot')?.dataset.screen || (el.querySelector('.crop') ? 'nudges-pair' : null), img: tag(el.firstElementChild), widthPx: el.getBoundingClientRect().width,
          caption: text(el.querySelector('figcaption')), legend: [...el.querySelectorAll('.legend li')].map(text) };
        const last = p.blocks[p.blocks.length - 1];
        if (row && last?.type === 'row' && last.parent === row) last.figs.push(fig);
        else if (row) p.blocks.push({ type: 'row', parent: row, figs: [fig] });
        else p.blocks.push(fig);
      }
    }
    for (const b of p.blocks) delete b.parent;
    pages.push(p);
  }
  return pages;
});

// Screenshot every tagged element (4× → screen figures land at 280–400 dpi in Word)
const ids = await page.evaluate(() => [...document.querySelectorAll('[data-shot]')].map((e) => e.getAttribute('data-shot')));
for (const id of ids) {
  const el = page.locator(`[data-shot="${id}"]`);
  await el.scrollIntoViewIfNeeded();
  await el.screenshot({ path: `${OUT}/${id}.png`, animations: 'disabled' });
}
fs.writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log(`✓ ${ids.length} images + manifest → ${OUT}/`);
await browser.close();
server.close();
