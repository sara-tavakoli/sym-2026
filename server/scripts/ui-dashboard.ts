// Dashboard rendering checks (no AI calls): desktop/mobile × light/dark, plus an empty new account.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:4000";
mkdirSync("shots", { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const problems: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => { if (!cond) problems.push(`${name} ${detail}`); console.log(cond ? "PASS" : "FAIL", name); };

const combos = [
  ["desktop-light", { width: 1366, height: 900 }, "light"],
  ["desktop-dark", { width: 1366, height: 900 }, "dark"],
  ["mobile-light", { width: 390, height: 844 }, "light"],
  ["mobile-dark", { width: 390, height: 844 }, "dark"],
] as const;

for (const [label, viewport, scheme] of combos) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  const page = await ctx.newPage();
  const chatCalls: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/assistant/chat")) chatCalls.push(r.url()); });
  page.on("pageerror", (e) => problems.push(`${label} page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/status of 401/.test(m.text())) problems.push(`${label} console: ${m.text()}`); });

  await page.goto(base + "/login");
  await page.getByLabel("Email").fill("demo@carepath.example");
  await page.getByLabel("Password").fill("demo-password-1");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("heading", { name: /(Good (morning|afternoon|evening)|Hello), Demo/ }).waitFor();
  await page.getByRole("heading", { name: "At a glance" }).waitFor();

  ok(`${label}: one primary action in the header`, (await page.locator(".dash-head .btn").count()) === 1 && (await page.locator(".dash-head .btn.primary").count()) === 1);
  ok(`${label}: no stat tiles`, (await page.locator(".stat, .stats").count()) === 0);
  ok(`${label}: full chat not embedded on dashboard`, (await page.locator(".assistant-log").count()) === 0);
  ok(`${label}: overview from real counts`, /upcoming appointment/.test(await page.locator(".overview").innerText()));
  ok(`${label}: next appointment is the focal point`, await page.getByRole("heading", { name: "Dr Alex Example", level: 2 }).isVisible());
  ok(`${label}: preparation tracker present`, (await page.locator(".prep-track").count()) === 1);
  ok(`${label}: safety notice present`, /isn't a medical service/.test(await page.locator(".app-foot").innerText()) && /000/.test(await page.locator(".app-foot").innerText()));
  ok(`${label}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (label.startsWith("desktop")) {
    ok(`${label}: sidebar groups`, (await page.locator(".nav-label").allTextContents()).join("|") === "Your care|Prepare and find");
    for (const n of ["Dashboard", "Appointments", "Follow-Up Tracker", "AI Assistant", "AI Preparation", "Fit Finder", "Settings"]) {
      ok(`${label}: nav has ${n}`, await page.locator(".sidebar").getByRole("link", { name: n, exact: true }).isVisible());
    }
  }
  await page.waitForTimeout(350);
  await page.screenshot({ path: `shots/dash-${label}.png`, fullPage: true });
  await page.screenshot({ path: `shots/dash-${label}-fold.png` });

  if (label === "desktop-light") {
    await page.getByLabel("What would you like help with?").fill("Help me plan questions for my GP visit");
    await page.getByRole("button", { name: "Open assistant" }).click();
    await page.waitForURL(/\/app\/assistant$/);
    ok("assistant entry carries the text to the full assistant", (await page.getByLabel("Message the CarePath AI Assistant").inputValue()) === "Help me plan questions for my GP visit");
    await page.waitForTimeout(500);
    ok("no AI request is sent until the user presses Send", chatCalls.length === 0);
    await page.screenshot({ path: "shots/assistant-page-light.png" });
  }
  await ctx.close();
}

// Empty state: a brand-new account sees honest empty states, not sample data.
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: "light" });
const page = await ctx.newPage();
await page.goto(base + "/register");
await page.getByLabel("Name").fill("Empty Tester");
await page.getByLabel("Email").fill(`empty-${Date.now()}@example.com`);
await page.getByLabel("Password").fill("empty-pass-123");
await page.getByRole("button", { name: "Create account" }).click();
await page.getByRole("heading", { name: /(Good (morning|afternoon|evening)|Hello), Empty/ }).waitFor();
await page.getByText("No upcoming appointments").first().waitFor();
ok("new account: overview shows zeros", /^0\s*upcoming appointments/m.test(await page.locator(".overview").innerText()));
ok("new account: no example records", (await page.locator(".appt-row, .task-row").count()) === 0);
await page.waitForTimeout(350);
await page.screenshot({ path: "shots/dash-empty-light.png", fullPage: true });
await browser.close();

console.log(`\n${problems.length} problems`);
problems.forEach((p) => console.log(" -", p));
process.exit(problems.length ? 1 : 0);
