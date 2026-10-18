// Walks the clinician consult workspace through the real UI and saves screenshots (desktop + phone).
// Usage: BASE=http://localhost:5100 OUT=/tmp/shots npx tsx server/scripts/ui-consult.ts
import { chromium, type Page } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:4000";
const out = process.env.OUT ?? "./ui-consult-shots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors: string[] = [];
const watch = (p: Page, who: string) => {
  p.setDefaultTimeout(15_000);
  p.on("pageerror", (e) => errors.push(`[${who}] ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !/status of (401|404|503)/.test(m.text())) errors.push(`[${who}] ${m.text()}`); });
  return p;
};
const shot = (p: Page, name: string) => p.screenshot({ path: `${out}/${name}.png`, fullPage: true });

const alexCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-AU", timezoneId: "Australia/Sydney" });
const alex = watch(await alexCtx.newPage(), "patient");
await alex.goto(base + "/try");
await alex.getByRole("heading", { name: /, Alex$/ }).waitFor();
await alex.goto(base + "/app/appointments");
await alex.locator(".appt-row", { hasText: "Dr Priya Lee" }).first().locator("a").click();
await alex.getByRole("heading", { name: "Dr Priya Lee" }).waitFor();
const apptUrl = alex.url();
await alex.getByRole("button", { name: /Yes, share with my clinician/ }).click();
await alex.getByRole("button", { name: "Create share link" }).click();
const link = await alex.getByLabel("Your clinician link").inputValue();
console.log("share link", link);

for (const [label, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  if (label === "phone") break; // the phone pass below reuses the approved consult
  const docCtx = await browser.newContext({ viewport, locale: "en-AU", timezoneId: "Australia/Sydney" });
  const doc = watch(await docCtx.newPage(), "clinician");
  await doc.goto(link);
  await doc.getByText("Patient pre-consult brief").first().waitFor();
  await doc.getByRole("button", { name: "Load sample consultation transcript" }).click();
  await doc.waitForFunction(() => (document.querySelector("#consult-transcript") as HTMLTextAreaElement)?.value.length > 100);
  await shot(doc, `1-${label}-transcript`);
  await doc.getByRole("button", { name: "Draft notes and patient instructions" }).click();
  await doc.getByText(/Drafted by rules|Drafted by AI/).first().waitFor();
  await shot(doc, `2-${label}-draft`);

  // Edit the assessment and one instruction, then tick everything.
  await doc.getByLabel("Assessment").fill("Afternoon headaches, likely screen and eyesight related. Tiredness: check iron and thyroid.");
  await doc.getByLabel("Assessment").blur();
  const first = doc.getByLabel("Instruction 1", { exact: true });
  await first.fill("Get a blood test this week (full blood count, iron studies, thyroid function). The form is at reception.");
  await first.blur();
  await doc.getByText("All changes saved").waitFor();
  const boxes = doc.getByRole("checkbox", { name: /^Approve instruction/ });
  const n = await boxes.count();
  for (let i = 0; i < n; i++) { await boxes.nth(i).check(); await doc.getByText("All changes saved").waitFor(); }
  await doc.getByText(`${n} of ${n} approved`).waitFor();
  await doc.getByRole("radio", { name: /Before \/ After/ }).click();
  await doc.locator(".ba ins").first().waitFor();
  await shot(doc, `3-${label}-before-after`);
  await doc.getByRole("radio", { name: /Review & edit/ }).click();
  await doc.getByLabel("Approving clinician (name and role)").fill("Dr Priya Lee, GP");
  await doc.getByLabel(/I have reviewed these notes/).check();
  await doc.getByRole("button", { name: /^Approve & release to/ }).click();
  await doc.getByText("Approved & released").first().waitFor();
  await doc.getByText("Patient-friendly summary").waitFor();
  await shot(doc, `4-${label}-approved`);
  await docCtx.close();
}

// Patient sees plan + summary + activity, then turns it into a checklist.
await alex.goto(apptUrl);
await alex.getByText("New after-visit plan from Dr Priya Lee, GP").waitFor();
await alex.getByText("In plain words").waitFor();
await alex.locator(".share-activity").getByText(/approved the notes/).waitFor();
await shot(alex, "5-desktop-patient-plan");
await alex.getByRole("button", { name: "Turn into checklist" }).click();
await alex.waitForFunction(() => (document.querySelector(".instr textarea") as HTMLTextAreaElement | null)?.value.includes("full blood count"));
await shot(alex, "6-desktop-patient-checklist");

// Phone screenshots: clinician (approved state) and patient.
const phone = { viewport: { width: 390, height: 844 }, locale: "en-AU", timezoneId: "Australia/Sydney", isMobile: true, hasTouch: true };
const docPhone = watch(await (await browser.newContext(phone)).newPage(), "clinician-phone");
await docPhone.goto(link);
await docPhone.getByText("Approved & released").first().waitFor();
await shot(docPhone, "7-phone-clinician-approved");
const alexPhone = watch(await (await browser.newContext({ ...phone, storageState: await alexCtx.storageState() })).newPage(), "patient-phone");
await alexPhone.goto(apptUrl);
await alexPhone.getByText("In plain words").waitFor();
await shot(alexPhone, "8-phone-patient-plan");
const overflow = await Promise.all([docPhone, alexPhone].map((p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
if (overflow.some(Boolean)) errors.push(`horizontal overflow on phone: ${overflow}`);

await browser.close();
if (errors.length) { console.log("PROBLEMS\n" + errors.join("\n")); process.exit(1); }
console.log(`OK, screenshots in ${out}`);
