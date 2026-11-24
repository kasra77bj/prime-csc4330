// Printable sketch guide for the paper lo-fi session: one lo-fi sheet per landscape Letter page, with its route
// and what to draw, plus the route diagram last. Output: exports/PRIME_lofi_sketch_guide.pdf
// Run: npm run lofi-guide (after npm run render)
import { chromium } from 'playwright';
import fs from 'node:fs';
import { startServer } from './serve.mjs';

const sheets = [
  ['L01-login-mfa', 'Login + MFA', '/login → /login/verify', 'Logo on top, form card centered under it. MFA: six code boxes, timer, Verify.'],
  ['L02-dashboard', 'Home / Dashboard', '/dashboard', '4 KPI cards · 3 printer cards (name, status, layer bar, 4 values, button) · shift goal bar.'],
  ['L03-live-monitor', 'Live Print Monitor', '/prints/:id/live', 'Warning banner · 3×2 value cards with limit charts · quality + layer rings · Escalate · control bar.'],
  ['L04-vision', 'Vision', '/prints/:id/vision', 'Camera view with W / H labels on the bead · measured vs target · width chart · Flag as artifact.'],
  ['L05-trends', 'Trends', '/prints/:id/trends', 'Signal list · time chips · one chart (x-axis = layers, limits, AI dashed, event markers) · 4 stats.'],
  ['L06-ai-recommendations', 'AI Recommendations', '/prints/:id/ai', 'Detail left (title, confidence, predicted effect, Why, Accept/Modify/Reject) · queue right.'],
  ['L07-session-report', 'Session Report', '/sessions/:id/report', 'KPIs · one chart with alerts overlaid · AI summary + Adjustments / Parameters tabs · exports.'],
  ['flow', 'Routes between screens', 'draw arrows with the blue marker', 'Lay the sheets out in this order and label each arrow with its trigger.'],
];
const html = `<!doctype html><meta charset="utf-8"><style>
@page { size: Letter landscape; margin: 0.4in; }
body { margin: 0; font-family: Kalam, 'Comic Sans MS', cursive; color: #1C1E21; }
section { break-after: page; height: 7.7in; display: flex; flex-direction: column; gap: 8px; }
section:last-child { break-after: auto; }
h1 { margin: 0; font-size: 22px; } p { margin: 0; font-size: 14px; color: #5F6368; }
img { width: 100%; max-height: 6.6in; object-fit: contain; border: 1px solid #DCD9D3; }
</style><link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap" rel="stylesheet">
${sheets.map(([f, t, r, d], i) => `<section><h1>${i + 1}. ${t} <span style="font-weight:400;font-size:15px;color:#5F6368">${r}</span></h1><p>${d}</p><img src="exports/${f}@2x.png"></section>`).join('')}`;
fs.writeFileSync('exports/preview/lofi-guide.html', html.replaceAll('src="exports/', 'src="../'));
const server = await startServer();
let browser;
for (const opt of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) { try { browser = await chromium.launch(opt); break; } catch {} }
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/exports/preview/lofi-guide.html`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: 'exports/PRIME_lofi_sketch_guide.pdf', format: 'Letter', landscape: true, printBackground: true, preferCSSPageSize: true });
console.log('✓ exports/PRIME_lofi_sketch_guide.pdf');
await browser.close(); server.close();
