// Visual check of the Nov-25 edits: centered login, Team lead starts a print, live tile order,
// auto-pause banner, Trends with no signal, report PDF header on every page.
import { chromium } from "playwright-core";
const B = "http://localhost:5173", API = "http://127.0.0.1:8000/api/v1";
const OUT = process.env.OUT ?? "./e2e/screenshots/edits/";
const json = { "content-type": "application/json" };
async function token(email, password) {
  let r = await fetch(`${API}/auth/login`, { method: "POST", headers: json, body: JSON.stringify({ email, password }) });
  r = await fetch(`${API}/auth/mfa/verify`, { method: "POST", headers: json, body: JSON.stringify({ mfa_token: (await r.json()).mfa_token, code: "246810" }) });
  return (await r.json()).access_token;
}
const demo = async (path, body = {}) => fetch(`${API}/demo${path}`, { method: "POST", headers: { ...json, authorization: `Bearer ${await token("admin@prime.demo", "admin123")}` }, body: JSON.stringify(body) });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on("pageerror", (e) => errors.push(e.message));
await demo("/reset");
await page.goto(`${B}/login`);
await page.getByTestId("login-logo").waitFor();
await page.screenshot({ path: `${OUT}01_login_1440.png` });
await page.setViewportSize({ width: 1024, height: 768 });
await page.screenshot({ path: `${OUT}02_login_1024.png` });
await page.setViewportSize({ width: 1440, height: 900 });
await page.fill("#email", "kasra@prime.demo"); await page.fill("#pw", "Prime!2026");
await page.click("button[type=submit]"); await page.waitForURL("**/login/verify"); await page.waitForTimeout(300);
await page.keyboard.type("246810");
await page.waitForURL(/\/(dashboard|onboarding)/);
if (page.url().includes("onboarding")) { await page.getByRole("button", { name: "Skip setup" }).click(); await page.waitForURL("**/dashboard"); }
await page.getByRole("button", { name: /Open to start/ }).first().click();
await page.waitForURL("**/live");
const sid = page.url().split("/prints/")[1].split("/")[0];
await page.getByRole("button", { name: "Start print" }).click();   // Team lead can start the demo print
await page.getByText(/Printing layer 1/).waitFor({ timeout: 30000 });
await demo(`/sessions/${sid}/speed`, { multiplier: 20 });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}03_live_tiles.png` });
const labels = await page.getByTestId("live-tiles").locator(":scope > *").evaluateAll((els) => els.map((e) => e.textContent.slice(0, 22)));
console.log("tile order:", labels.join(" | "));
const mp = await page.getByTestId("live-tiles").locator(":scope > *").nth(3).textContent();
console.log("motor power tile:", mp.slice(0, 60));
// wait for the L5 suggestion, ignore it -> L6 critical -> auto pause
await page.getByTestId("auto-pause-banner").waitFor({ timeout: 120000 });
await page.screenshot({ path: `${OUT}04_auto_paused.png` });
const st1 = await (await fetch(`${API}/sessions/${sid}`, { headers: { authorization: `Bearer ${await token("kasra@prime.demo", "Prime!2026")}` } })).json();
console.log("after critical:", st1.status, st1.auto_paused, st1.pause_reason);
await page.getByRole("button", { name: "Review AI suggestion" }).click();
await page.waitForURL("**/ai");
await page.screenshot({ path: `${OUT}05_ai_while_paused.png` });
await page.getByRole("button", { name: /^Accept/ }).first().click();
await page.waitForTimeout(2500);
const st2 = await (await fetch(`${API}/sessions/${sid}`, { headers: { authorization: `Bearer ${await token("kasra@prime.demo", "Prime!2026")}` } })).json();
console.log("after accept:", st2.status, st2.auto_paused);
await page.screenshot({ path: `${OUT}06_after_accept.png` });
// Trends with nothing selected
await page.getByLabel("Print views").getByRole("link", { name: "Trends" }).click();
await page.waitForURL("**/trends");
await page.getByLabel(/Layer width/).first().uncheck();
await page.waitForTimeout(800);
await page.getByTestId("trend-chart").waitFor();
await page.screenshot({ path: `${OUT}07_trends_empty.png` });
// stop & report PDF (use the completed history session)
const tok = await token("kasra@prime.demo", "Prime!2026");
const sessions = await (await fetch(`${API}/sessions`, { headers: { authorization: `Bearer ${tok}` } })).json();
const done = sessions.find((s) => s.status === "completed");
await page.goto(`${B}/sessions/${done.id}/report`);
await page.getByText("Adjustment log").waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
await page.emulateMedia({ media: "print" });
await page.pdf({ path: `${OUT}08_report.pdf`, format: "Letter", preferCSSPageSize: true });
await page.emulateMedia({ media: "screen" });
await page.screenshot({ path: `${OUT}09_report_screen.png` });
console.log("page errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
