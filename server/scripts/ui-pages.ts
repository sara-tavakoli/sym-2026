// Visual audit: screenshots of every page (no AI calls) in desktop/mobile × light/dark, plus basic health checks.
// Usage: npx tsx server/scripts/ui-pages.ts [filter]   (server running, seeded demo user)
import { chromium, type Page } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:4000";
const filter = process.argv[2] ?? "";
const out = "shots/pages";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const problems: string[] = [];

// Find the demo user's records through the normal API (as the user would see them).
const ctx0 = await browser.newContext();
const p0 = await ctx0.newPage();
await p0.goto(base + "/login");
await p0.getByLabel("Email").fill("demo@carepath.example");
await p0.getByLabel("Password").fill("demo-password-1");
await p0.getByRole("button", { name: "Log in" }).click();
await p0.waitForURL(/\/app$/);
const ids = await p0.evaluate(async () => {
  const up = await (await fetch("/api/appointments?scope=upcoming&pageSize=1")).json();
  const past = await (await fetch("/api/appointments?scope=past&pageSize=1")).json();
  let drafts = (await (await fetch("/api/drafts")).json()).items;
  let created = false;
  if (!drafts.length) {
    created = true;
    // A form-origin draft (no AI) so the draft page can be audited.
    const d = await (await fetch("/api/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
    await fetch(`/api/drafts/${d.id}/notes`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes: { main_concern: "Fictional: sore wrist after long typing sessions", questions: "Should I adjust my desk setup?" } }) });
    drafts = [d];
  }
  return { up: up.items[0]?.id, past: past.items[0]?.id, draft: drafts[0].id, created };
});

const pages: [string, string, ((p: Page) => Promise<void>)?][] = [
  ["landing", "/"],
  ["login", "/login"],
  ["appointments", "/app/appointments"],
  ["appointment-new", "/app/appointments?new=1"],
  ["appointment-upcoming", `/app/appointments/${ids.up}`],
  ["appointment-past", `/app/appointments/${ids.past}`],
  ["assistant", "/app/assistant"],
  ["preparation", "/app/preparation"],
  ["prepare", `/app/appointments/${ids.up}/prepare`],
  ["brief", `/app/appointments/${ids.up}/brief`],
  ["draft", `/app/drafts/${ids.draft}`],
  ["fitfinder", "/app/fit-finder?category=gp&location=Macquarie%20Park&days=sat%2Csun&bulk_billing=true"],
  ["compare", "/app/fit-finder/compare?ids=ava-example,priya-placeholder,sam-demo&location=Macquarie%20Park&bulk_billing=true&days=sat%2Csun"],
  ["followup", "/app/follow-up"],
  ["settings", "/app/settings"],
];

for (const [label, viewport, scheme] of [["desktop-light", { width: 1366, height: 900 }, "light"], ["desktop-dark", { width: 1366, height: 900 }, "dark"], ["mobile-light", { width: 390, height: 844 }, "light"], ["mobile-dark", { width: 390, height: 844 }, "dark"]] as const) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`${label}: page error ${e.message}`));
  page.on("request", (r) => { if (/\/api\/(assistant\/chat|drafts\/from-chat|fit-finder\/extract)|\/generate|\/regenerate|\/extract/.test(r.url())) problems.push(`${label}: unexpected AI request ${r.url()}`); });
  for (const [name, path] of pages) {
    if (filter && !name.includes(filter)) continue;
    const authed = path.startsWith("/app");
    if (authed && !(await ctx.cookies()).some((c) => c.name === "carepath_session")) {
      await page.goto(base + "/login");
      await page.getByLabel("Email").fill("demo@carepath.example");
      await page.getByLabel("Password").fill("demo-password-1");
      await page.getByRole("button", { name: "Log in" }).click();
      await page.waitForURL(/\/app$/);
    }
    if (!authed && (await ctx.cookies()).length) await ctx.clearCookies();
    await page.goto(base + path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(450);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflow) problems.push(`${label}/${name}: horizontal overflow`);
    await page.screenshot({ path: `${out}/${name}-${label}.png`, fullPage: true });
  }
  await ctx.close();
}
// Remove the audit draft if this run created it, so the demo account is left as it was.
if (ids.created) await p0.evaluate(async (id) => { await fetch(`/api/drafts/${id}`, { method: "DELETE" }); }, ids.draft);
await ctx0.close();
await browser.close();
console.log(`${problems.length} problems`);
problems.forEach((p) => console.log(" -", p));
process.exit(problems.length ? 1 : 0);
