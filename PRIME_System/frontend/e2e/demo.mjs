// End-to-end run of the final-demo script (docs/18 §2, numbers from docs/20 §4) plus the operator-only path.
// Needs backend :8000 (DEMO_MODE=true) + frontend :5173. Resets the demo data first, then runs at 20x.
// Run: make e2e   (or: cd frontend && npm run e2e)  ·  HEADED=1 to watch  ·  CHROME_PATH=... for a custom browser
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const B = process.env.E2E_BASE ?? "http://localhost:5173";
const API = process.env.E2E_API ?? "http://127.0.0.1:8000/api/v1";   // 127.0.0.1: Node resolves localhost to IPv6
const SHOTS = new URL("./screenshots/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
mkdirSync(SHOTS, { recursive: true });

const results = [];
let current = null;
async function step(story, name, fn) {
  current = `${story} · ${name}`;
  const t0 = Date.now();
  try {
    await fn();
    results.push({ story, name, ok: true, s: ((Date.now() - t0) / 1000).toFixed(1) });
    console.log(`  ok   ${story.padEnd(14)} ${name}`);
  } catch (e) {
    results.push({ story, name, ok: false, s: ((Date.now() - t0) / 1000).toFixed(1), err: String(e).split("\n")[0] });
    console.log(`  FAIL ${story.padEnd(14)} ${name}\n       ${String(e).split("\n")[0]}`);
    await Promise.all(pages.map((p, i) => p.screenshot({ path: `${SHOTS}FAIL_window${i}.png` }).catch(() => undefined)));
    throw e;
  }
}
const shot = (p, n) => p.screenshot({ path: `${SHOTS}${n}.png` });
const json = { "content-type": "application/json" };

async function token(email, password) {
  let r = await fetch(`${API}/auth/login`, { method: "POST", headers: json, body: JSON.stringify({ email, password }) });
  r = await fetch(`${API}/auth/mfa/verify`, { method: "POST", headers: json, body: JSON.stringify({ mfa_token: (await r.json()).mfa_token, code: "246810" }) });
  return (await r.json()).access_token;
}
async function demo(path, body = {}) {
  const r = await fetch(`${API}/demo${path}`, { method: "POST", headers: { ...json, authorization: `Bearer ${await token("admin@prime.demo", "admin123")}` }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`demo${path} -> ${r.status} ${await r.text()}`);
}
async function login(page, email, pw, landing = /\/(dashboard|onboarding)/) {
  await page.goto(`${B}/login`);
  await page.fill("#email", email);
  await page.fill("#pw", pw);
  await page.click("button[type=submit]");
  await page.waitForURL("**/login/verify");
  await page.waitForTimeout(300);
  await page.keyboard.type("246810");
  await page.waitForURL(landing, { timeout: 15000 });
}
async function holdStop(page) {
  const box = await page.getByRole("button", { name: /Hold to stop/ }).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1900);
  await page.mouse.up();
}
// each print tab mounts its own layout + control bar: wait for the Live page before clicking or holding STOP
async function toLive(page) {
  await page.getByRole("link", { name: "Live", exact: true }).click();
  await page.waitForURL("**/live");
  await page.getByRole("button", { name: /Escalate to engineer/ }).first().waitFor();
}
const text = (page, t, timeout = 15000) => page.getByText(t).first().waitFor({ timeout });

const browser = await chromium.launch({ headless: !process.env.HEADED, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.E2E_CHANNEL ?? "chrome" }) });
const ctx = async (w, h) => {
  const c = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
  // performance check: count main-thread tasks > 50 ms (dropped frames) on the live pages
  await c.addInitScript(() => {
    window.__long = [];
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: "longtask", buffered: true }); } catch { /* unsupported */ }
  });
  const p = await c.newPage();
  pages.push(p);
  p.on("pageerror", (e) => errors.push(`${current}: ${e}`));
  return p;
};
const errors = [];
const pages = [];
let exitCode = 0;
let perf = null;

try {
  // ------------------------------------------------------------ main demo (operator Maya, engineer, admin, manager)
  await step("setup", "reset demo data", () => demo("/reset"));
  const op = await ctx(1024, 768);       // Maya's tablet
  const eng = await ctx(1440, 900);      // engineer desktop
  const adm = await ctx(1440, 900);      // Sam's admin window

  await step("US-01", "operator signs in with 2FA and lands in onboarding", async () => {
    await login(op, "maya@prime.demo", "Prime!2026", /\/onboarding\/welcome/);
    await text(op, "Welcome to PRIME, Maya");
  });
  await step("onboarding", "role explains locks, tour practices hold-to-stop", async () => {
    await op.getByRole("button", { name: "Get started" }).click();
    await text(op, "Needs another role");
    await op.getByRole("button", { name: "Next" }).click();
    await op.waitForURL("**/onboarding/tour");
    for (let i = 0; i < 3; i++) await op.getByRole("button", { name: "Next" }).click();
    await text(op, "Practice hold-to-stop");
    await holdStop(op);
    await text(op, "Practice done");
    await shot(op, "01_tour_hold_to_stop");
    await op.getByRole("button", { name: "Next" }).click();
    await op.getByRole("button", { name: "Finish" }).click();
    await op.waitForURL("**/dashboard");
    await text(op, "Getting started 3/5");
  });
  await step("US-02", "admin creates an engineer; 2FA enrollment is forced", async () => {
    await login(adm, "admin@prime.demo", "admin123");
    await adm.goto(`${B}/admin/users?new=1`);
    const dlg = adm.getByRole("dialog");
    await dlg.getByLabel("Full name").fill("Carlos M.");
    await dlg.getByLabel("Email").fill("carlos.m@prime.demo");
    await dlg.getByText("Engineer", { exact: true }).click();
    await dlg.getByRole("button", { name: "Create user" }).click();
    await text(adm, "Temporary password, shown only once");
    await shot(adm, "02_user_created");
    await dlg.getByRole("button", { name: "Done" }).click();
    await adm.getByRole("row", { name: /Carlos M\..*Pending first sign-in/ }).waitFor();
  });
  await step("US-01", "engineer signs in", () => login(eng, "engineer@prime.demo", "engineer123", /\/dashboard/));

  let sid = null;
  await step("US-03/04", "operator starts WP-03; live temperature, speed and nozzle update", async () => {
    await op.getByRole("button", { name: /Open to start/ }).first().click();
    await op.waitForURL("**/live");
    sid = op.url().split("/prints/")[1].split("/")[0];
    await op.getByRole("button", { name: "Start print" }).click();
    await text(op, /Printing layer 1/);
    await demo(`/sessions/${sid}/speed`, { multiplier: 20 });
    await text(op, "Nozzle N2");
    await text(op, /^\d{2}\.\d °C$/);              // live temperature value
    await text(op, /Printing layer 2/, 20000);
  });
  await step("US-06/07", "layer-5 width warning; operator pauses at once", async () => {
    await op.getByRole("alert").filter({ hasText: /Layer width .* below target/ }).waitFor({ timeout: 60000 });
    await op.getByRole("button", { name: "Pause", exact: true }).click();
    await text(op, /Paused on layer 5/);
    await shot(op, "03_warning_paused");
  });
  await step("US-05", "View opens Vision with the measured bead overlay", async () => {
    await op.getByRole("button", { name: "View" }).click();
    await op.waitForURL("**/vision");
    await text(op, "Measured vs target");
    await op.getByRole("img", { name: /Camera view of layer 5/ }).waitFor();
    await shot(op, "04_vision");
    await toLive(op);
  });
  await step("US-06", "operator acknowledges and escalates; receipt toast", async () => {
    await op.getByRole("button", { name: "Acknowledge" }).first().click();
    await text(op, "(acknowledged)");
    await op.getByRole("button", { name: /Escalate to engineer/ }).first().click();
    await text(op, "Engineer notified");
  });
  await step("US-09", "engineer sees the AI suggestion with reasons and predicted effect", async () => {
    await eng.getByRole("link", { name: "AI suggestions" }).click();
    await eng.waitForURL(`**/prints/${sid}/ai`);
    await text(eng, /Increase pump speed 27 → 3\d RPM/);
    await text(eng, "Predicted effect (next 3 checkpoints)");
    await eng.getByRole("img", { name: /Layer width .* with the change/ }).waitFor();
    await text(op, /is reviewing/);          // escalation answered when the engineer opened the AI page
    await shot(eng, "05_ai_suggestion");
  });
  await step("US-10", "engineer modifies the value and applies it", async () => {
    await eng.getByRole("button", { name: "Modify" }).click();
    await eng.getByRole("button", { name: "Increase", exact: true }).click();
    await eng.getByRole("button", { name: /^Apply \d+ RPM$/ }).click();
    await text(eng, /Change queued: \d+ RPM/);
    await eng.getByRole("tab", { name: "Accepted (1)" }).waitFor();
  });
  await step("US-10", "operator resumes; change applies at layer 6 (nudge)", async () => {
    await op.getByRole("button", { name: "Resume", exact: true }).click();
    await demo(`/sessions/${sid}/speed`, { multiplier: 8 });     // the planned demo pace for layers 6-8
    await text(op, "Change applied at layer 6", 30000);
    await text(op, "Applied L6");
  });
  await step("predictive", "layer-7 interlayer-delay suggestion; operator heads-up", async () => {
    await text(eng, /Increase interlayer delay 5 → 10 min/, 60000);
    await text(op, "Heads-up from the AI");
    await eng.getByRole("button", { name: /Increase interlayer delay 5 → 10 min/ }).first().click();
    await eng.getByRole("button", { name: "Accept", exact: true }).click();
    await text(eng, "Change queued: 10 min");
  });
  await step("US-11", "manual adjustment logged as an independent decision", async () => {
    await eng.getByRole("button", { name: "Manual adjust" }).click();
    const d = eng.getByRole("dialog");
    await d.getByRole("button", { name: "Increase", exact: true }).click();
    await d.getByLabel(/Note/).fill("Bead edge looks thin on the camera; one RPM more.");
    await d.getByRole("button", { name: "Apply at next layer" }).click();
    await text(eng, /Manual change queued: Pump speed/);
    await eng.getByRole("tab", { name: "Manual (1)" }).waitFor();
    await text(eng, "Manual (independent decision)");
    await shot(eng, "06_adjustment_log");
  });
  await step("reliability", "network drop: Reconnecting, then no data lost", async () => {
    await demo(`/sessions/${sid}/disconnect`, { seconds: 4 });
    await text(op, /Reconnecting/, 8000);
    await text(op, "Reconnected, no data lost", 20000);
  });
  await step("US-07", "print completes; controls disabled; operator gets the summary", async () => {
    await text(op, "Print completed", 90000);
    perf = await op.evaluate(() => window.__long);
    await text(op, /report ready/, 15000);
    if (await op.getByRole("button", { name: /Hold to stop/ }).isEnabled()) throw new Error("STOP still enabled after completion");
    await shot(op, "07_completed");
  });
  await step("US-08", "trends: whole print, model line, annotations; export locked for operator", async () => {
    await op.goto(`${B}/prints/${sid}/trends`);
    await op.getByRole("button", { name: "Whole print" }).click();
    await op.locator(".recharts-line path").first().waitFor();
    await text(op, /applied \(AI suggestion\)/);
    await op.getByRole("button", { name: /Download view \(CSV\)/ }).and(op.locator("[disabled]")).waitFor();
    await shot(op, "08_trends");
  });
  await step("US-13", "manager opens the generated report", async () => {
    const mgr = await ctx(1440, 900);
    await login(mgr, "jordan@prime.demo", "Prime!2026");
    await mgr.goto(`${B}/sessions/${sid}/report`);
    await text(mgr, "Wall Panel WP-03 on Gantry-02 finished after 8 of 8 layers", 20000);
    await text(mgr, "Model agreement");
    await text(mgr, /modified and applied the AI suggestion/);
    await shot(mgr, "09_report");
    await step("US-12", "manager exports CSV (zip) and JSON; PDF uses the print layout", async () => {
      for (const [label, ext] of [[/^CSV/, ".zip"], [/^JSON/, ".json"]]) {
        await mgr.getByRole("button", { name: /Export/ }).click();
        const [dl] = await Promise.all([mgr.waitForEvent("download"), mgr.getByRole("menuitem", { name: label }).click()]);
        if (!dl.suggestedFilename().endsWith(ext)) throw new Error(`unexpected file ${dl.suggestedFilename()}`);
      }
      await mgr.emulateMedia({ media: "print" });
      if (await mgr.getByRole("navigation", { name: "Main" }).isVisible()) throw new Error("navigation visible in print layout");
      await mgr.pdf({ path: `${SHOTS}10_report.pdf`, format: "Letter" }).catch(() => undefined);   // headless only
    });
  });
  await step("gamification", "achievements show badges, team goal and shift numbers", async () => {
    await op.goto(`${B}/me/achievements`);
    await text(op, /Badges · \d of 6 earned/);
    await text(op, "Shift B goal");
    await text(op, "Your shift in numbers");
  });

  // ------------------------------------------------------------ operator-only path: nobody acts -> critical -> hold-to-stop
  await step("setup", "reset demo data", () => demo("/reset"));
  const solo = await ctx(1024, 768);
  await step("US-01", "operator signs in and skips setup", async () => {
    await login(solo, "maya@prime.demo", "Prime!2026", /\/onboarding\/welcome/);
    await solo.getByRole("button", { name: "Skip setup" }).click();
    await solo.waitForURL("**/dashboard");
  });
  let sid2 = null;
  await step("operator-only", "AI suggestion is read-only with a lock and Escalate", async () => {
    await solo.getByRole("button", { name: /Open to start/ }).first().click();
    await solo.waitForURL("**/live");
    sid2 = solo.url().split("/prints/")[1].split("/")[0];
    await solo.getByRole("button", { name: "Start print" }).click();
    await text(solo, /Printing layer 1/);
    await demo(`/sessions/${sid2}/speed`, { multiplier: 20 });
    await solo.getByRole("link", { name: "AI", exact: true }).click();
    await text(solo, /Increase pump speed 27 → 3\d RPM/, 60000);
    await solo.getByRole("button", { name: /Accept/ }).and(solo.locator("[disabled]")).first().waitFor();
    await solo.getByRole("button", { name: "Escalate to engineer" }).first().waitFor();
    await solo.getByRole("button", { name: /Manual adjust/ }).and(solo.locator("[disabled]")).waitFor();
    await shot(solo, "11_operator_locked_ai");
  });
  await step("operator-only", "no action -> critical width alert on every print tab", async () => {
    await solo.getByRole("alert").filter({ hasText: /Critical/ }).filter({ hasText: /Layer width/ }).waitFor({ timeout: 60000 });
    await shot(solo, "12_critical");
  });
  await step("US-07", "hold-to-stop stops the print", async () => {
    await toLive(solo);
    await holdStop(solo);
    await text(solo, "Print stopped");
    await shot(solo, "13_stopped");
  });
} catch {
  exitCode = 1;
} finally {
  await browser.close();
}

const long = perf ?? [];
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} steps passed · page errors: ${errors.length ? errors.join(" | ") : "none"}`);
console.log(`live page main-thread tasks > 50 ms during the run: ${long.length}${long.length ? ` (max ${Math.round(Math.max(...long))} ms)` : ""}`);
console.log(`screenshots: ${SHOTS}`);
if (errors.length) exitCode = 1;
process.exit(exitCode);
