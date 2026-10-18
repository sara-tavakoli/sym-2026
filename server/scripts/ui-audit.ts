// Visual audit: screenshots every page at desktop/light and phone/dark, and reports horizontal overflow,
// console errors and unnamed interactive elements. Usage: BASE=http://localhost:4900 OUT=/tmp/shots npm run ui-audit
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:4000";
const out = process.env.OUT ?? "ui-audit-shots";
const only = process.env.ONLY; // optional substring filter on shot names
mkdirSync(out, { recursive: true });

const browser: Browser = await chromium.launch();
const problems: string[] = [];

const VIEWS = [
  { tag: "desk", viewport: { width: 1366, height: 860 }, colorScheme: "light" as const, isMobile: false },
  { tag: "phone", viewport: { width: 390, height: 844 }, colorScheme: "dark" as const, isMobile: true },
];

async function ctxFor(v: (typeof VIEWS)[number], storageState?: Awaited<ReturnType<BrowserContext["storageState"]>>) {
  const ctx = await browser.newContext({ viewport: v.viewport, colorScheme: v.colorScheme, isMobile: v.isMobile, hasTouch: v.isMobile, deviceScaleFactor: 1, storageState });
  return ctx;
}

function watch(page: Page, label: () => string) {
  page.on("console", (m) => { if (m.type() === "error") problems.push(`[console] ${label()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${label()}: ${e.message}`));
}

async function audit(page: Page, name: string) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(350);
  const r = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const unnamed: string[] = [];
    document.querySelectorAll<HTMLElement>("a[href], button, input:not([type=hidden]), select, textarea, [role=button]").forEach((el) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || !el.getClientRects().length) return;
      const id = el.id;
      const lbl = (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title") || (el as HTMLElement).innerText || "").trim()
        || (id && document.querySelector(`label[for="${id}"]`)) || el.closest("label") || (el as HTMLInputElement).placeholder;
      if (!lbl) unnamed.push(el.outerHTML.slice(0, 120));
    });
    return { overflow, unnamed };
  });
  if (r.overflow > 1) problems.push(`[overflow ${r.overflow}px] ${name}`);
  for (const u of r.unnamed) problems.push(`[unnamed] ${name}: ${u}`);
}

async function shot(page: Page, name: string, fullPage = true) {
  if (only && !name.includes(only)) return;
  await audit(page, name);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage });
}

// ---------- setup (desktop) ----------
const setupCtx = await ctxFor(VIEWS[0]);
const sp = await setupCtx.newPage();
sp.setDefaultTimeout(30_000);
await sp.goto(base + "/try");
await sp.waitForURL(/\/app$/);
const appts = await sp.evaluate(async () => (await (await fetch("/api/appointments?scope=all&pageSize=50")).json()));
const list: { id: string; practitioner_name: string; starts_at: string }[] = appts.items ?? appts.appointments ?? appts;
const priya = list.find((a) => /Priya Lee/.test(a.practitioner_name) && new Date(a.starts_at) > new Date()) ?? list.find((a) => /Priya Lee/.test(a.practitioner_name))!;
const past = list.filter((a) => new Date(a.starts_at) < new Date()).sort((a, b) => b.starts_at.localeCompare(a.starts_at))[0];
console.log("priya", priya?.id, "past", past?.id);

// Share link
await sp.goto(`${base}/app/appointments/${priya.id}`);
let shareLink = "";
await sp.getByRole("button", { name: /Yes, share with my clinician/ }).click({ timeout: 8000 }).catch(() => {});
const shareBtn = sp.getByRole("button", { name: "Create share link" });
await shareBtn.waitFor({ timeout: 8000 }).catch(() => {});
if (await shareBtn.count()) {
  await shareBtn.click();
  await sp.locator(".share-link input").waitFor();
  shareLink = await sp.locator(".share-link input").inputValue();
  // Clinician ticks a question and sends a plan back, so the patient view shows "plans from your clinician".
  const cp = await setupCtx.newPage();
  await cp.goto(shareLink);
  await cp.locator(".cv-check").first().check().catch(() => {});
  await cp.locator("#plan-author").fill("Dr Lee, GP");
  await cp.locator("#plan-text").fill("Blood test (FBC, iron studies) this week. Book a review in 2 weeks. Call if the headaches get worse.");
  await cp.getByRole("button", { name: /^Send to/ }).click();
  await cp.locator(".cv-sent").waitFor().catch(() => {});
  await cp.close();
}
// Circle invite
await sp.goto(`${base}/app/circle`);
await sp.locator('input[name="name"]').fill("Mia Example");
await sp.locator('input[name="email"]').fill("mia@example.com");
await sp.getByRole("button", { name: "Create invite link" }).click();
await sp.locator(".invite-link input").waitFor();
const inviteLink = await sp.locator(".invite-link input").inputValue();
const demoState = await setupCtx.storageState();
await setupCtx.close();
console.log("share", shareLink, "invite", inviteLink);

// Fresh account
const freshCtx = await ctxFor(VIEWS[0]);
const fp = await freshCtx.newPage();
await fp.goto(base + "/register");
await fp.getByLabel("Name").fill("Fresh Tester");
await fp.getByLabel("Email").fill(`fresh-${Date.now()}@example.com`);
await fp.getByLabel("Password").fill("fresh-pass-123");
await fp.getByRole("button", { name: "Create account" }).click();
await fp.waitForURL(/\/app$/);
const freshState = await freshCtx.storageState();
await freshCtx.close();

// ---------- capture ----------
let ownerId = "";
for (const v of VIEWS) {
  const t = v.tag;
  // Public
  {
    const ctx = await ctxFor(v); const p = await ctx.newPage(); let cur = ""; watch(p, () => cur);
    for (const [n, u] of [["landing", "/"], ["login", "/login"], ["register", "/register"]] as const) { cur = `${t}-${n}`; await p.goto(base + u); await shot(p, cur); }
    if (shareLink) { cur = `${t}-clinician`; await p.goto(shareLink); await shot(p, cur); }
    await ctx.close();
  }
  // Demo account
  {
    const ctx = await ctxFor(v, demoState); const p = await ctx.newPage(); let cur = ""; watch(p, () => cur);
    const pages: [string, string][] = [
      ["dashboard", "/app"], ["appointments", "/app/appointments"], ["appt-priya", `/app/appointments/${priya.id}`],
      ["appt-past", `/app/appointments/${past.id}`], ["prepare", `/app/appointments/${priya.id}/prepare`],
      ["brief-print", `/app/appointments/${priya.id}/brief`], ["preparation", "/app/preparation"], ["assistant", "/app/assistant"],
      ["follow-up", "/app/follow-up"], ["circle", "/app/circle"], ["supporting-demo", "/app/supporting"], ["settings", "/app/settings"],
      ["fit-finder-empty", "/app/fit-finder"], ["fit-finder", "/app/fit-finder?category=gp&location=Macquarie+Park"],
    ];
    for (const [n, u] of pages) { cur = `${t}-${n}`; await p.goto(base + u); await shot(p, cur); }
    // Compare: tick first two providers
    cur = `${t}-compare`;
    const toggles = p.locator(".compare-toggle input");
    if ((await toggles.count()) >= 2) {
      await toggles.nth(0).check(); await toggles.nth(1).check();
      await shot(p, `${t}-fit-finder-tray`);
      await p.locator(".compare-tray a, .compare-tray button").last().click();
      await p.waitForURL(/compare/);
      await shot(p, cur);
    }
    // Import modal
    await p.goto(base + "/app/appointments");
    await p.getByRole("button", { name: "Import booking confirmation" }).click();
    cur = `${t}-import-modal`; await shot(p, cur, false);
    const sample = p.getByRole("button", { name: /Sample email/i });
    if (await sample.count()) { await sample.first().click(); await shot(p, `${t}-import-sample`, false); }
    // Draft message modal
    await p.goto(base + "/app");
    const draft = p.getByRole("button", { name: "Draft a message to the clinic" });
    await draft.first().waitFor({ timeout: 8000 }).catch(() => {});
    if (await draft.count()) { await draft.first().click(); cur = `${t}-draft-modal`; await shot(p, cur, false); }
    await ctx.close();
  }
  // Fresh account: empty states, join, supporting
  {
    const ctx = await ctxFor(v, freshState); const p = await ctx.newPage(); let cur = ""; watch(p, () => cur);
    for (const [n, u] of [["empty-dashboard", "/app"], ["empty-appointments", "/app/appointments"], ["empty-follow-up", "/app/follow-up"],
      ["empty-preparation", "/app/preparation"], ["empty-circle", "/app/circle"], ["empty-supporting", "/app/supporting"]] as const) {
      cur = `${t}-${n}`; await p.goto(base + u); await shot(p, cur);
    }
    if (!ownerId) {
      await p.goto(inviteLink); cur = `${t}-join`; await shot(p, cur);
      await p.getByRole("button", { name: /^Accept as/ }).click();
      await p.waitForURL(/\/app\/supporting\/.+/);
      ownerId = p.url().split("/").pop()!;
    } else {
      await p.goto(inviteLink); cur = `${t}-join`; await shot(p, cur);
    }
    cur = `${t}-supporting`; await p.goto(base + "/app/supporting"); await shot(p, cur);
    cur = `${t}-supporting-owner`; await p.goto(`${base}/app/supporting/${ownerId}`); await shot(p, cur);
    await ctx.close();
  }
}

await browser.close();
console.log(problems.length ? problems.join("\n") : "No problems found");
console.log(`Screenshots in ${out}`);
