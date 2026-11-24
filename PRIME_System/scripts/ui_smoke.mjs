// UI smoke test of the demo story (Phase 2). Needs backend :8000 + frontend :5173 running and a fresh seed.
// Run: npm i -D playwright && npx playwright install chromium && mkdir -p screenshots && node scripts/ui_smoke.mjs
import { chromium } from 'playwright';
const B = 'http://localhost:5173', API = 'http://localhost:8000/api/v1';
const shot = (p, n) => p.screenshot({ path: `screenshots/${n}.png` });
async function login(page, email, pw) {
  await page.goto(`${B}/login`);
  await page.fill('#email', email); await page.fill('#pw', pw);
  await page.click('button[type=submit]');
  await page.waitForURL('**/login/verify');
  await page.waitForTimeout(500);
  await page.keyboard.type('246810');
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}
async function adminToken() {
  let r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@prime.demo', password: 'admin123' }) });
  const t = (await r.json()).mfa_token;
  r = await fetch(`${API}/auth/mfa/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mfa_token: t, code: '246810' }) });
  return (await r.json()).access_token;
}
const b = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const eng = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const op = await (await b.newContext({ viewport: { width: 1024, height: 768 } })).newPage();
const errors = [];
for (const p of [eng, op]) p.on('pageerror', (e) => errors.push(String(e)));
await eng.goto(`${B}/login`); await shot(eng, '01_login');
await login(eng, 'engineer@prime.demo', 'engineer123');
await eng.waitForTimeout(1500); await shot(eng, '02_dashboard_engineer');
await login(op, 'maya@prime.demo', 'Prime!2026');
await op.waitForTimeout(1000); await shot(op, '03_dashboard_operator_welcome');
// open WP-03 and start
await eng.getByRole('button', { name: /Open to start/ }).first().click();
await eng.waitForURL('**/live'); const sid = eng.url().split('/prints/')[1].split('/')[0];
await eng.waitForTimeout(800); await shot(eng, '04_live_ready');
await eng.getByRole('button', { name: 'Start print' }).click();
await op.goto(`${B}/prints/${sid}/live`);
const adm = await adminToken();
await eng.waitForTimeout(2500);
await fetch(`${API}/demo/sessions/${sid}/speed`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${adm}` }, body: JSON.stringify({ multiplier: 60 }) });
// wait for the AI suggestion (layer 5)
await eng.getByText(/Increase pump speed 27/).first().waitFor({ timeout: 90000 });
await fetch(`${API}/demo/sessions/${sid}/speed`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${adm}` }, body: JSON.stringify({ multiplier: 2 }) });
await eng.waitForTimeout(6000);
await shot(eng, '05_live_engineer_suggestion'); await shot(op, '06_live_operator_tablet_suggestion');
await op.getByRole('button', { name: /Escalate to engineer/ }).first().click();
await eng.waitForTimeout(1500); await shot(eng, '07_engineer_after_escalation');
await eng.getByRole('button', { name: 'Accept' }).first().click();
await eng.waitForTimeout(1200); await shot(eng, '08_after_accept');
await fetch(`${API}/demo/sessions/${sid}/speed`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${adm}` }, body: JSON.stringify({ multiplier: 60 }) });
await eng.getByText(/Increase interlayer delay 5/).first().waitFor({ timeout: 120000 });
await fetch(`${API}/demo/sessions/${sid}/speed`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${adm}` }, body: JSON.stringify({ multiplier: 2 }) });
await eng.waitForTimeout(2000); await shot(eng, '09_delay_suggestion'); await shot(op, '10_operator_layer7');
// hold-to-stop on the operator tablet
const stop = op.getByRole('button', { name: /Hold to stop/ });
const box = await stop.boundingBox();
await op.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await op.mouse.down();
await op.waitForTimeout(700); await shot(op, '11_hold_to_stop_progress');
await op.waitForTimeout(1200); await op.mouse.up();
await op.waitForTimeout(1500); await shot(op, '12_stopped');
console.log('session', sid, 'page errors:', errors.length ? errors : 'none');
await b.close();
