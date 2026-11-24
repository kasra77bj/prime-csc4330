// Rasterizes exports/PRIME_Milestone2.pdf page by page with pdf.js (in Chrome) for QA.
// Output: exports/preview/report-p{n}.png at 200 % zoom (the "zoom the PDF to 200 %" check in plan/09 Phase 4).
// Run: npm run preview [scale]   (default scale 2 = 200 %)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { startServer } from './serve.mjs';

const scale = Number(process.argv[2]) || 2;
const file = process.argv[3] || 'exports/PRIME_Milestone2.pdf', prefix = process.argv[4] || 'report';
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/`;
let browser;
for (const opt of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) { try { browser = await chromium.launch(opt); break; } catch {} }
const page = await browser.newPage();
await page.goto(base + 'scripts/'); // any same-origin page (404 body is fine)
const pages = await page.evaluate(async ({ base, scale, file }) => {
  const pdfjs = await import(base + 'node_modules/pdfjs-dist/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = base + 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument(base + file).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const vp = p.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    out.push(c.toDataURL('image/png'));
  }
  return out;
}, { base, scale, file });
fs.mkdirSync('exports/preview', { recursive: true });
pages.forEach((d, i) => fs.writeFileSync(`exports/preview/${prefix}-p${i + 1}.png`, Buffer.from(d.split(',')[1], 'base64')));
console.log(`✓ ${pages.length} page(s) → exports/preview/report-p*.png at ${scale * 100} %`);
await browser.close();
server.close();
