// Browser check of "Help me find care" (public + signed in), the red-flag path and the demo guide. No AI calls.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:4000";
const shots = process.env.SHOTS ?? "shots";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
const problems: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => { if (!cond) problems.push(`${name} ${detail}`); console.log(cond ? "PASS" : "FAIL", name, cond ? "" : detail); };

for (const [label, viewport, scheme] of [["desktop", { width: 1280, height: 900 }, "light"], ["phone", { width: 390, height: 844 }, "dark"]] as const) {
  const page = await (await browser.newContext({ viewport, colorScheme: scheme })).newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (e) => problems.push(`${label} page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/status of (40[01]|422)/.test(m.text())) problems.push(`${label} console: ${m.text()}`); });
  const overflow = async (where: string) => ok(`${label}: no horizontal overflow on ${where}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  // 1. Red-flag path on the public page.
  await page.goto(base + "/find-care");
  await page.getByRole("heading", { name: "Help me find care" }).waitFor();
  await page.getByLabel(/In your own words/).fill("My dad has chest pain and can't breathe properly");
  const alert = page.getByRole("alert").filter({ hasText: "Call 000" });
  await alert.waitFor();
  ok(`${label}: emergency banner has a tel:000 link`, (await alert.getByRole("link", { name: "Call 000" }).getAttribute("href")) === "tel:000");
  ok(`${label}: Next is disabled until acknowledged`, await page.getByRole("button", { name: "Next" }).isDisabled());
  await page.screenshot({ path: `${shots}/findcare-redflag-${label}.png`, fullPage: true });
  await page.getByLabel(/In your own words/).fill("I've been having thoughts of self-harm");
  await page.getByRole("link", { name: "Call Lifeline 13 11 14" }).waitFor();
  ok(`${label}: Lifeline shown for self-harm`, (await page.getByRole("link", { name: "Call Lifeline 13 11 14" }).getAttribute("href")) === "tel:131114");

  // 2. Questionnaire -> clinic type stage -> Find a clinic lists suitable clinics on the same page (no account needed).
  await page.getByLabel(/In your own words/).fill("Sore ankle after a fall");
  await page.locator(".fc-chip", { hasText: "Physiotherapist" }).waitFor();
  ok(`${label}: Might suit chip appears while typing`, true);
  ok(`${label}: no emergency banner for a sore ankle`, (await page.locator(".fc-emergency").count()) === 0);
  await page.screenshot({ path: `${shots}/findcare-step1-${label}.png`, fullPage: true });
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Less than a week").check();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("No, not yet").check();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel(/Suburb or postcode/).fill("2113");
  await page.getByLabel("In person").check();
  await overflow("step 4");
  await page.getByRole("button", { name: "Show me where to start" }).click();
  await page.locator(".fc-type-name", { hasText: /physiotherapist/i }).waitFor();
  ok(`${label}: reason quotes the person's words`, (await page.locator(".fc-reason").innerText()).includes("“ankle”"));
  await overflow("result");
  await page.screenshot({ path: `${shots}/findcare-result-${label}.png`, fullPage: true });
  ok(`${label}: summary repeats the person's words`, (await page.locator(".fc-summary").innerText()).includes("Sore ankle after a fall"));
  await page.getByRole("button", { name: "Find a clinic", exact: true }).click();
  await page.locator(".fc-clinic").first().waitFor();
  const listHead = await page.locator("#fc-clinics-h").innerText();
  ok(`${label}: physiotherapy clinics near Macquarie Park listed`, /physiotherapist/i.test(listHead) && /Macquarie Park/.test(listHead), listHead);
  await page.screenshot({ path: `${shots}/findcare-clinics-${label}.png`, fullPage: false });

  // 3. Demo guide (sign in to a /try sandbox, then open Book care).
  await page.goto(base + "/try");
  await page.waitForURL(/\/app$/);
  await page.goto(base + "/app/get-care");
  await page.getByRole("heading", { name: "Do you know what kind of care you need?" }).waitFor();
  const fab = page.getByRole("button", { name: /Demo guide/ });
  await fab.waitFor();
  if (label === "phone") {
    const f = await fab.boundingBox(), nav = await page.locator(".bottomnav").boundingBox();
    ok(`${label}: demo guide button sits above the bottom nav`, !!f && !!nav && f.y + f.height <= nav.y, JSON.stringify({ f, nav }));
  }
  await fab.click();
  const dialog = page.getByRole("dialog", { name: "3-minute demo guide" });
  await dialog.waitFor();
  ok(`${label}: focus moves into the guide`, await page.evaluate(() => !!document.activeElement?.closest(".dg-sheet")));
  await page.waitForTimeout(500);
  ok(`${label}: Find care step ticked from the visit`, (await page.locator('[data-step="find"]').getAttribute("data-done")) === "true");
  await page.screenshot({ path: `${shots}/demoguide-${label}.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  ok(`${label}: Escape closes and focus returns`, await page.evaluate(() => document.activeElement?.classList.contains("dg-fab") ?? false));

  // 4. Signed-in route + dashboard link.
  await page.goto(base + "/app");
  await page.getByRole("link", { name: "Help me find care" }).click();
  await page.waitForURL(/\/app\/find-care$/);
  await page.getByRole("heading", { name: "Help me find care" }).waitFor();
  await overflow("/app/find-care");
  await page.screenshot({ path: `${shots}/findcare-app-${label}.png`, fullPage: true });
  await page.context().close();
}
await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join("\n")}` : "\nAll checks passed");
process.exit(problems.length ? 1 : 0);
