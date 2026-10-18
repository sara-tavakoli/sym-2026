// Browser walk-through of the care path: Brenda feels unwell → Help me find care → summary + pathway → choose a
// clinic and a time (signed out) → sign up → complete profile → review → confirm → dashboard → prepare → keep the
// brief for herself. Also the "I know what I need" path. Desktop (light) and phone (dark). No AI key needed.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:4000";
const shots = process.env.SHOTS ?? "shots";
mkdirSync(shots, { recursive: true });
// BROWSER_CHANNEL=msedge or chrome uses an installed browser instead of a downloaded Playwright build.
const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
const problems: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => { if (!cond) problems.push(`${name} ${detail}`); console.log(cond ? "PASS" : "FAIL", name, cond ? "" : detail); };
const CONCERN = "I have a headache and feel unsure what to do";

for (const [label, viewport, scheme] of [["desktop", { width: 1280, height: 900 }, "light"], ["phone", { width: 390, height: 844 }, "dark"]] as const) {
  const page = await (await browser.newContext({ viewport, colorScheme: scheme })).newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (e) => problems.push(`${label} page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/status of (40[01]|422)/.test(m.text())) problems.push(`${label} console: ${m.text()}`); });
  const overflow = async (where: string) => ok(`${label}: no horizontal overflow on ${where}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  // 1. Start: does Brenda know what care she needs? No → Help me find care.
  await page.goto(base + "/get-care");
  await page.getByRole("heading", { name: "Do you know what kind of care you need?" }).waitFor();
  await overflow("/get-care");
  await page.screenshot({ path: `${shots}/book-start-${label}.png`, fullPage: true });
  await page.getByRole("link", { name: /Help me find care/ }).click();
  await page.getByRole("heading", { name: "Help me find care" }).waitFor();

  // 2. Describe the concern, answer the follow-up questions, see the summary and the suggested pathway.
  await page.getByLabel(/In your own words/).fill(CONCERN);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("1 to 4 weeks").check();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("No, not yet").check();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel(/Suburb or postcode/).fill("Macquarie Park");
  await page.getByRole("button", { name: "Show me where to start" }).click();
  const summary = page.locator(".fc-summary");
  await summary.waitFor();
  ok(`${label}: summary quotes Brenda's words`, (await summary.innerText()).includes(CONCERN));
  ok(`${label}: summary lists the follow-up answers`, /1 to 4 weeks/.test(await summary.innerText()) && /No, not yet/.test(await summary.innerText()));
  ok(`${label}: the clinic type to start with is a GP`, /GP/.test(await page.locator(".fc-type-name").innerText()), await page.locator(".fc-type-name").innerText());
  ok(`${label}: no clinics until Find a clinic is pressed`, (await page.locator(".fc-clinic").count()) === 0);
  await overflow("clinic type stage");
  await page.screenshot({ path: `${shots}/book-pathway-${label}.png`, fullPage: true });

  // 3. Find a clinic: suitable GP clinics appear straight away on the same page (signed out).
  await page.getByRole("button", { name: "Find a clinic", exact: true }).click();
  await page.locator(".fc-clinic").first().waitFor();
  ok(`${label}: GP clinics listed on the same page`, /\/find-care/.test(page.url()) && /GP/.test(await page.locator("#fc-clinics-h").innerText()), page.url());
  await overflow("clinic list");
  await page.screenshot({ path: `${shots}/book-clinics-${label}.png`, fullPage: true });
  await page.locator(".fc-clinic").first().getByRole("button", { name: /Book appointment/ }).click();
  await page.waitForURL(/\/book\//);

  // 4. Choose a time.
  await page.getByRole("heading", { name: "Choose a day and time" }).waitFor();
  ok(`${label}: reason for visit carried from Help me find care`, (await page.getByLabel(/Reason for visit/).inputValue()) === CONCERN);
  await page.locator(".bk-slot.is-on").waitFor();
  ok(`${label}: earliest time pre-selected (demo default)`, (await page.locator(".bk-slot").first().getAttribute("aria-pressed")) === "true");
  ok(`${label}: Continue ready straight away`, await page.getByRole("button", { name: "Continue" }).isEnabled());
  await overflow("choose a time");
  await page.screenshot({ path: `${shots}/book-time-${label}.png`, fullPage: true });
  await page.getByRole("button", { name: "Continue" }).click();

  // 5. Signed in already? No → create an account; the chosen time survives the trip.
  await page.getByRole("heading", { name: "Sign in to finish booking" }).waitFor();
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.waitForURL(/\/register\?next=/);
  ok(`${label}: sign-up explains the booking is kept`, await page.getByRole("note").filter({ hasText: "finish your booking" }).waitFor().then(() => true, () => false));
  await page.getByLabel("Name").fill("Brenda Example");
  const email = `brenda-${label}-${Date.now()}@example.com`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app\/book\/.+slot=/);

  // 6. Complete the patient profile (new account), then review.
  await page.getByRole("heading", { name: "Complete your patient profile" }).waitFor();
  ok(`${label}: profile pre-filled (demo default)`, (await page.getByLabel("Mobile phone").inputValue()) === "0400 123 456");
  await page.getByLabel("Mobile phone").fill("call me");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.locator(".err").first().waitFor();
  ok(`${label}: profile validates`, (await page.locator(".err").count()) >= 1);
  await page.getByLabel("Mobile phone").fill("0400 000 000");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByRole("heading", { name: "Review your booking" }).waitFor();
  const review = await page.locator(".bk-review").innerText();
  ok(`${label}: review shows appointment and patient details`, review.includes("Brenda Example") && review.includes("0400 000 000") && review.includes(CONCERN), review);
  await overflow("review");
  await page.screenshot({ path: `${shots}/book-review-${label}.png`, fullPage: true });

  // 7. Confirm → reference → it's on the dashboard.
  await page.getByRole("button", { name: "Confirm appointment" }).click();
  await page.getByRole("heading", { name: "Appointment confirmed" }).waitFor();
  const ref = await page.locator(".bk-ref").innerText();
  ok(`${label}: booking reference shown`, /^CP-[0-9A-F]{6}$/.test(ref), ref);
  await page.screenshot({ path: `${shots}/book-done-${label}.png`, fullPage: true });
  const practitioner = (await page.locator(".bk-head h1").innerText()).trim();
  await page.getByRole("link", { name: "Go to dashboard" }).click();
  await page.waitForURL(/\/app$/);
  await page.getByRole("heading", { name: practitioner }).first().waitFor();
  ok(`${label}: appointment appears on the dashboard`, true);

  // 8. AI preparation starts from Brenda's own words; generate a brief (rules fallback without a key).
  await page.getByRole("link", { name: "Prepare for this visit" }).click();
  await page.waitForURL(/\/prepare$/);
  ok(`${label}: main concern prefilled from the booking`, (await page.getByLabel("What is your main concern?").inputValue()) === CONCERN);
  await page.getByLabel("Questions you want to ask").fill("Should I keep a headache diary?");
  await page.getByRole("button", { name: "Generate brief" }).click();
  await page.getByRole("button", { name: "Save brief" }).waitFor({ timeout: 90_000 });
  await page.getByRole("button", { name: "Save brief" }).click();
  await page.getByRole("button", { name: "Open printable brief" }).waitFor();

  // 9. Share brief with clinician? No → keep it for herself; My journey reflects it.
  await page.goto(page.url().replace(/\/prepare$/, ""));
  await page.getByRole("heading", { name: practitioner }).waitFor();
  ok(`${label}: journey starts at Booked`, (await page.locator(".journey li").first().innerText()).includes("Booked"));
  await page.getByRole("button", { name: /No, keep it for myself/ }).click();
  await page.getByRole("status").filter({ hasText: "Your brief stays private" }).waitFor();
  ok(`${label}: journey shows Kept private as done`, (await page.locator(".journey li.done").allInnerTexts()).some((t) => t.includes("Kept private")));
  ok(`${label}: no share link form while private`, (await page.getByRole("button", { name: "Create share link" }).count()) === 0);
  await page.getByRole("button", { name: /Yes, share with my clinician/ }).click();
  await page.getByRole("button", { name: "Create share link" }).waitFor();
  ok(`${label}: changing to share shows the link form`, true);
  await overflow("appointment detail");
  await page.screenshot({ path: `${shots}/book-journey-${label}.png`, fullPage: true });

  // 10. The other branch: Brenda knows what she needs → search clinics directly (public search, then inside the app).
  await page.context().clearCookies();
  await page.goto(base + "/get-care");
  await page.getByRole("link", { name: /Search clinics directly/ }).click();
  await page.waitForURL(/\/search$/);
  await page.getByRole("heading", { name: "Find a clinic" }).waitFor();
  ok(`${label}: no saved searches or compare when signed out`, (await page.getByRole("button", { name: "Save search" }).count()) === 0 && (await page.locator(".compare-toggle").count()) === 0);
  await page.getByLabel(/Service type/).selectOption("gp");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator("article.provider-card").first().waitFor();
  ok(`${label}: public search lists clinics with Book buttons`, (await page.locator("article.provider-card").first().getByRole("button", { name: /Book appointment/ }).count()) === 1);
  await overflow("/search");
  await page.goto(base + "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/app$/);
  await page.goto(base + "/app/get-care");
  await page.getByRole("link", { name: /Search clinics directly/ }).click();
  await page.waitForURL(/\/app\/fit-finder$/);
  await page.getByRole("heading", { name: "Fit Finder" }).waitFor();
  ok(`${label}: signed-in direct search is Fit Finder`, true);
  await page.context().close();
}
await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join("\n")}` : "\nAll checks passed");
process.exit(problems.length ? 1 : 0);
