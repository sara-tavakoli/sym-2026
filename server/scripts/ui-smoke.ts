// Browser smoke test (uses installed Microsoft Edge). Requires the server running on :4000 with the seeded demo user
// whose upcoming appointment already has a confirmed brief and whose past appointment has tasks.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:4000";
const out = process.env.SHOTS ?? "shots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const problems: string[] = [];
let checks = 0;
const ok = (name: string, cond: boolean) => { checks++; if (!cond) problems.push(name); console.log(cond ? "PASS" : "FAIL", name); };

for (const [label, viewport, scheme] of [["desktop-light", { width: 1280, height: 850 }, "light"], ["mobile-dark", { width: 375, height: 800 }, "dark"]] as const) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10_000);
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource: the server responded with a status of 40[01]/.test(m.text())) problems.push(`console error (${label}): ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`page error (${label}): ${e.message}`));
  const overflow = async (name: string) => ok(`${label}: no horizontal overflow on ${name}`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

  await page.goto(base + "/");
  ok(`${label}: landing headline`, await page.getByRole("heading", { name: /doesn't start and end with an appointment/ }).isVisible());
  ok(`${label}: both CTAs`, (await page.getByRole("link", { name: "Prepare for an Appointment" }).isVisible()) && (await page.getByRole("link", { name: "Manage Follow-Up Tasks" }).isVisible()));
  await overflow("landing"); await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${label}-landing.png` });

  await page.goto(base + "/app");
  await page.waitForURL(/\/login$/);
  ok(`${label}: protected route redirects to login`, true);
  await page.getByLabel("Email").fill("demo@carepath.example");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("alert").filter({ hasText: "Incorrect email or password" }).waitFor();
  ok(`${label}: wrong password shows error`, true);
  await page.getByLabel("Password").fill("demo-password-1");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("heading", { name: /Hello, Demo/ }).waitFor();
  await overflow("dashboard"); await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${label}-dashboard.png`, fullPage: true });

  await page.goto(base + "/app/appointments?new=1");
  await page.getByRole("button", { name: "Create appointment" }).click();
  await page.getByRole("dialog").getByRole("alert").first().waitFor();
  ok(`${label}: form validation errors shown`, true);
  await page.locator('input[name="when"]').fill("2030-01-15T10:30");
  await page.locator('input[name="practitioner_name"]').fill(`Dr UI ${label}`);
  await page.locator('input[name="clinic_name"]').fill("UI Test Clinic");
  await page.getByRole("button", { name: "Create appointment" }).click();
  await page.getByText(`Dr UI ${label}`).first().waitFor();
  ok(`${label}: created appointment appears`, true);
  await overflow("appointments"); await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${label}-appointments.png` });

  await page.getByText(`Dr UI ${label}`).first().click();
  await page.getByRole("heading", { name: `Dr UI ${label}` }).waitFor();
  await overflow("detail"); await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${label}-detail.png`, fullPage: true });
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.locator('input[name="clinic_name"]').fill("Renamed Clinic");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Renamed Clinic").first().waitFor();
  ok(`${label}: edit shown after save`, true);
  await page.getByRole("button", { name: "Delete", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/app\/appointments$/);
  ok(`${label}: deleted appointment gone`, (await page.getByText(`Dr UI ${label}`).count()) === 0);

  await page.goto(base + "/app/preparation");
  await page.getByRole("link", { name: /Dr Alex Example/ }).click();
  await page.getByRole("heading", { name: "Main reason for the appointment" }).waitFor();
  ok(`${label}: brief shows source links`, await page.getByText("Source: Main concern").first().isVisible());
  await overflow("prepare"); await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${label}-prepare.png`, fullPage: true });
  await page.getByRole("button", { name: "Open printable brief" }).click();
  await page.getByRole("button", { name: "Print or save as PDF" }).waitFor();
  await overflow("print view"); await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${label}-brief.png`, fullPage: true });

  await page.goto(base + "/app/follow-up");
  await page.getByRole("heading", { name: "Follow-Up Tracker" }).waitFor();
  await page.getByText("Call the clinic").first().waitFor();
  await overflow("follow-up"); await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${label}-followup.png`, fullPage: true });

  await page.keyboard.press("Tab");
  ok(`${label}: keyboard focus lands on an element`, await page.evaluate(() => document.activeElement !== document.body));

  await page.goto(base + "/app/settings");
  await page.getByRole("radio", { name: "Dark" }).click();
  ok(`${label}: theme toggle applies`, (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark");
  await page.getByRole("radio", { name: "System" }).click();
  await ctx.close();
}
await browser.close();
console.log(`\n${checks} checks, ${problems.length} problems`);
problems.forEach((p) => console.log(" -", p));
process.exit(problems.length ? 1 : 0);
