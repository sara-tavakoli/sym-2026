// Browser test of Fit Finder + comparison + draft briefs WITHOUT AI calls (structured paths only).
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:4000";
mkdirSync("shots", { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const problems: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => { if (!cond) problems.push(`${name} ${detail}`); console.log(cond ? "PASS" : "FAIL", name); };

for (const [label, viewport, scheme] of [["desktop-light", { width: 1280, height: 900 }, "light"], ["mobile-dark", { width: 390, height: 844 }, "dark"]] as const) {
  const page = await (await browser.newContext({ viewport, colorScheme: scheme })).newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (e) => problems.push(`${label} page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/status of (40[01]|422)/.test(m.text())) problems.push(`${label} console: ${m.text()}`); });
  const savedName = `Weekend GP ${label} ${Date.now()}`;
  page.on("dialog", (d) => d.accept(savedName));
  const overflow = async (where: string) => ok(`${label}: no horizontal page overflow on ${where}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  await page.goto(base + "/login");
  await page.getByLabel("Email").fill("demo@carepath.example");
  await page.getByLabel("Password").fill("demo-password-1");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("heading", { name: /Hello, Demo/ }).waitFor();

  // Navigation
  if (label === "desktop-light") {
    for (const n of ["Dashboard", "Appointments", "AI Assistant", "AI Preparation", "Fit Finder", "Follow-Up Tracker", "Settings"]) {
      ok(`sidebar has ${n}`, await page.locator(".sidebar nav").getByRole("link", { name: n }).isVisible());
    }
    await page.locator(".sidebar nav").getByRole("link", { name: "Fit Finder" }).click();
  } else {
    ok("mobile: Find in bottom nav", await page.locator(".bottomnav").getByText("Find").isVisible());
    await page.locator(".bottomnav").getByText("Find").click();
  }
  await page.getByRole("heading", { name: "Fit Finder", level: 1 }).waitFor();
  ok(`${label}: fictional-directory notice shown`, await page.getByText("Every provider shown is fictional").isVisible());
  await overflow("Fit Finder (empty)");

  // Structured search: GP near Macquarie Park, weekends, bulk billing
  await page.getByLabel("Service type *").selectOption("gp");
  await page.getByLabel("Suburb or postcode").fill("Macquarie Park");
  await page.getByRole("button", { name: "Sat", exact: true }).click();
  await page.getByRole("button", { name: "Sun", exact: true }).click();
  await page.getByLabel("Bulk billing (where verified)").check();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("heading", { name: /providers? near Macquarie Park/ }).waitFor();
  ok(`${label}: URL carries the search`, /category=gp/.test(page.url()) && /days=sat%2Csun|days=sat,sun/.test(page.url()));
  const cards = page.locator(".provider-card");
  ok(`${label}: results rendered`, (await cards.count()) >= 2);
  ok(`${label}: every card labelled fictional`, (await page.locator(".provider-card .badge", { hasText: "Fictional demo" }).count()) === (await cards.count()));
  ok(`${label}: explanation shown`, await cards.first().getByText("Why it's here:").isVisible());
  ok(`${label}: "Needs verification" group appears somewhere`, (await page.getByText("Needs verification").count()) > 0);
  await cards.first().locator("summary").click();
  ok(`${label}: hours labelled as not availability`, await cards.first().getByText(/not appointment availability/).first().isVisible());
  await overflow("results");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/ff-${label}-results.png`, fullPage: true });

  // Save search
  await page.getByRole("button", { name: "Save search" }).click();
  await page.locator(".saved-row").getByText(savedName).waitFor();
  ok(`${label}: search saved`, true);
  await page.getByRole("button", { name: `Delete saved search ${savedName}` }).click();
  await page.locator(".saved-row").getByText(savedName).waitFor({ state: "detached" });
  ok(`${label}: saved search deleted`, true);

  // Compare two providers
  await cards.nth(0).getByLabel("Compare").check();
  await cards.nth(1).getByLabel("Compare").check();
  await page.getByRole("button", { name: "Compare side by side" }).click();
  await page.getByRole("heading", { name: "Compare providers" }).waitFor();
  ok(`${label}: comparison table has 2 providers`, (await page.locator(".cmp thead th").count()) === 3);
  ok(`${label}: no clinical-quality claim disclaimer`, await page.getByText("does not indicate the quality of clinical care").isVisible());
  await overflow("compare");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/ff-${label}-compare.png`, fullPage: true });

  // Unknown location -> suggestions
  await page.goto(base + "/app/fit-finder?category=dentist&location=Atlantis");
  await page.getByText("isn't in the demo directory's coverage area").waitFor();
  ok(`${label}: unknown location explained with suggestions`, (await page.locator(".alert .chip-link").count()) > 5);

  if (label === "desktop-light") {
    // Add to my appointments (prefilled form, nothing booked)
    await page.goto(base + "/app/fit-finder?category=optometrist&location=Macquarie%20Park");
    await page.locator(".provider-card").first().getByRole("button", { name: "Add to my appointments" }).click();
    ok("appointment form prefilled from provider", (await page.locator('input[name="clinic_name"]').inputValue()).includes("(Demo)"));
    await page.getByRole("button", { name: "Cancel" }).click();

    // Draft brief without an appointment (form path, no AI needed until generate)
    await page.goto(base + "/app/preparation");
    await page.getByRole("button", { name: "New draft brief" }).click();
    await page.waitForURL(/\/app\/drafts\//);
    await page.getByLabel("What is your main concern?").fill("Fictional: sore wrist after typing");
    await page.getByRole("button", { name: "Save notes" }).click();
    await page.getByText("Notes saved").waitFor();
    ok("draft brief created and notes saved without an appointment", true);
    await page.goto(base + "/app/preparation");
    await page.getByText("Fictional: sore wrist after typing").first().waitFor();
    ok("draft listed on AI Preparation (titled from the main concern)", true);
    await page.getByText("Fictional: sore wrist after typing").first().click();
    await page.getByRole("button", { name: "Delete draft" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(/\/app\/preparation$/);
    ok("draft deleted", (await page.getByText("Fictional: sore wrist after typing").count()) === 0);
  }
}
await browser.close();
console.log(`\n${problems.length} problems`);
problems.forEach((p) => console.log(" -", p));
process.exit(problems.length ? 1 : 0);
