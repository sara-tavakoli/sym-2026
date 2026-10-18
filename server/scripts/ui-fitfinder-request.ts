// Browser check of Fit Finder's "Read my request": plain words like "I have a headache" show GP clinics straight away
// (with the non-diagnostic reason), a named service searches directly, and emergency wording stops for the 000 notice.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:4000";
const shots = process.env.SHOTS ?? "shots";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
const problems: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => { if (!cond) problems.push(`${name} ${detail}`); console.log(cond ? "PASS" : "FAIL", name, cond ? "" : detail); };

const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.setDefaultTimeout(20_000);
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
await page.goto(base + "/login");
await page.getByRole("button", { name: "Log in" }).click(); // pre-filled presenter account
await page.waitForURL(/\/app$/);

await page.goto(base + "/app/fit-finder");
const box = page.locator("#nl-input");
ok("request box starts with the example text", (await box.inputValue()).includes("Macquarie Park"));

// 1. Symptoms only → GP clinics, immediately.
await box.fill("I have a headache");
await page.getByRole("button", { name: "Read my request" }).click();
await page.locator(".ff-pathway").waitFor();
ok("explains the GP suggestion with the person's words", /GP/.test(await page.locator(".ff-pathway").innerText()) && /headache/.test(await page.locator(".ff-pathway").innerText()));
await page.locator("article.provider-card").first().waitFor();
ok("GP providers listed without pressing Search", (await page.locator("article.provider-card").count()) > 0 && new URL(page.url()).searchParams.get("category") === "gp", page.url());
await page.screenshot({ path: `${shots}/fitfinder-headache.png`, fullPage: true });

// 2. The example request → filters picked out and results shown.
await box.fill("A GP around Macquarie Park on weekends, bulk billing if available, who speaks Mandarin");
await page.getByRole("button", { name: "Read my request" }).click();
await page.waitForURL(/language=Mandarin/);
ok("example request searches with its filters", await page.locator("#results-h", { hasText: "near Macquarie Park" }).waitFor().then(() => true, () => false), await page.locator("#results-h").innerText());
ok("no pathway note when a service is named", (await page.locator(".ff-pathway").count()) === 0);

// 3. Emergency wording: the 000 notice first, no automatic search.
await box.fill("I have chest pain and can't breathe");
await page.getByRole("button", { name: "Read my request" }).click();
await page.getByRole("link", { name: "Call 000" }).waitFor();
ok("emergency notice shown before any suggestion", (await page.locator(".ff-pathway").count()) === 0);

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join("\n")}` : "\nAll checks passed");
process.exit(problems.length ? 1 : 0);
