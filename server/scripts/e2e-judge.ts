// End-to-end judge journey through the real UI, no AI key needed (AI steps must fail gracefully).
// Three people: the demo patient (Alex), their clinician (signed out, share link) and a newly registered carer.
// Usage: BASE=http://localhost:4950 npm run e2e   (exit code 1 if any step fails)
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { fileURLToPath } from "node:url";

const base = process.env.BASE ?? "http://localhost:4000";
const icsPath = fileURLToPath(new URL("../../web/public/samples/sample-booking.ics", import.meta.url));
const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctxOpts = { viewport: { width: 1280, height: 900 }, locale: "en-AU", timezoneId: "Australia/Sydney" };

const problems: string[] = [];
const EXPECTED = /status of (401|403|404|503)\b/; // signed-out /me, viewer edit probe, revoked share link, AI not configured
function watch(page: Page, who: string) {
  page.setDefaultTimeout(15_000);
  page.on("console", (m) => { if (m.type() === "error" && !EXPECTED.test(m.text())) problems.push(`[${who}] console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`[${who}] pageerror: ${e.message}`));
  page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "E2E GP search" : undefined));
  return page;
}
async function newPage(who: string, ctx?: BrowserContext) {
  const c = ctx ?? (await browser.newContext(ctxOpts));
  await c.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  return watch(await c.newPage(), who);
}

const results: { name: string; ok: boolean; err?: string }[] = [];
async function step(name: string, fn: () => Promise<void>) {
  const before = problems.length;
  try {
    await fn();
    if (problems.length > before) throw new Error(problems.slice(before).join(" | "));
    results.push({ name, ok: true }); console.log(`PASS  ${name}`);
  } catch (e) {
    const err = (e as Error).message.split("\n")[0];
    results.push({ name, ok: false, err }); console.log(`FAIL  ${name}\n      ${err}`);
  }
}
const expect = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
const text = (p: Page, t: string | RegExp) => p.getByText(t).first().waitFor();

const alex = await newPage("patient");
let gpUrl = "";
let shareLink = "";
let inviteLink = "";

await step("landing → Try the live demo → dashboard with Needs attention, care circle and tasks", async () => {
  await alex.goto(base + "/");
  await alex.getByRole("link", { name: /Try the live demo/ }).first().click();
  await alex.getByRole("heading", { name: /, Alex$/ }).waitFor();
  const attn = alex.locator("section.attn");
  await attn.getByRole("heading", { name: "Needs attention" }).waitFor();
  await attn.getByText("Overdue").first().waitFor();
  await attn.getByText(/blood test/i).first().waitFor();
  const all = attn.getByRole("button", { name: /Show all/ });
  if (await all.count()) await all.click();
  await attn.getByText("Prepare now").first().waitFor();
  await attn.getByText(/Dr Tom Nguyen|Dentist|Smile Bright/).first().waitFor();
  expect((await attn.getByText("Needs clarification").count()) === 2, `expected 2 clarifications, got ${await attn.getByText("Needs clarification").count()}`);
  await alex.getByRole("heading", { name: "Your care circle" }).waitFor();
  await alex.getByRole("heading", { name: "Follow-up tasks" }).waitFor();
  const dentistTime = await alex.evaluate(async () => {
    const r = await fetch("/api/appointments?scope=upcoming&page=1&pageSize=8").then((x) => x.json());
    const d = r.items.find((a: { service_type: string }) => a.service_type === "Dentist");
    return new Date(d.starts_at).toLocaleTimeString("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" });
  });
  expect(/^4:00\s?pm$/i.test(dentistTime), `dentist should be at 4:00 pm Sydney time, got ${dentistTime}`);
});

await step("Draft a message to the clinic: modal opens and copies", async () => {
  await alex.getByRole("button", { name: "Draft a message to the clinic" }).first().click();
  const dlg = alex.getByRole("dialog");
  await dlg.getByLabel("Your message").waitFor();
  expect((await dlg.getByLabel("Your message").inputValue()).includes("Harbourside"), "message should mention the clinic");
  await dlg.getByRole("button", { name: "Copy message" }).click();
  await text(alex, "Message copied");
  const clip = await alex.evaluate(() => navigator.clipboard.readText());
  expect(clip.includes("Could you please confirm"), "clipboard should hold the message");
  await dlg.getByRole("button", { name: "Close" }).click();
});

await step("Needs attention actions: Go to task opens the follow-up; Prepare now opens preparation", async () => {
  await alex.goto(base + "/app");
  const attn = alex.locator("section.attn");
  await attn.getByRole("link", { name: "Go to task" }).first().click();
  await alex.waitForURL(/\/app\/appointments\/[^/]+#follow-up$/);
  await alex.getByRole("heading", { name: "After the visit" }).waitFor();
  await alex.getByText("Get blood test (FBC and iron studies)").first().waitFor();
  await alex.goto(base + "/app");
  const all = attn.getByRole("button", { name: /Show all/ });
  if (await all.count()) await all.click();
  await attn.getByRole("link", { name: "Prepare now" }).first().click();
  await alex.waitForURL(/\/prepare$/);
  await alex.getByLabel("What is your main concern?").waitFor();
});

await step("import booking confirmation from Sample email (fields prefilled with sources) → create → listed", async () => {
  await alex.goto(base + "/app/appointments");
  await alex.getByRole("button", { name: "Import booking confirmation" }).click();
  await alex.getByRole("button", { name: "Sample email" }).click();
  await alex.getByRole("button", { name: "Fill in the form" }).click();
  await text(alex, /Filled \d+ of \d+ fields/);
  expect((await alex.locator('input[name="practitioner_name"]').inputValue()) === "Dr Priya Example", "practitioner prefilled");
  expect((await alex.locator('input[name="clinic_name"]').inputValue()).includes("Wattle Grove"), "clinic prefilled");
  expect((await alex.locator('input[name="when"]').inputValue()).endsWith("T10:15"), "time prefilled as 10:15");
  await text(alex, /From your confirmation: “/);
  await alex.getByRole("button", { name: "Create appointment" }).click();
  await text(alex, "Appointment created");
  await alex.locator(".appt-row", { hasText: "Dr Priya Example" }).first().waitFor();
});

await step("import the sample .ics file → create → listed", async () => {
  await alex.getByRole("button", { name: "Import booking confirmation" }).click();
  await alex.locator('input[type="file"]').setInputFiles(icsPath);
  await text(alex, /Filled \d+ of \d+ fields from your calendar file/);
  expect((await alex.locator('input[name="practitioner_name"]').inputValue()).includes("Mei Sample"), "ics practitioner prefilled");
  await alex.getByRole("button", { name: "Create appointment" }).click();
  await text(alex, "Appointment created");
  await alex.locator(".appt-row", { hasText: "Mei Sample" }).first().waitFor();
});

await step("open confirmed-brief appointment → share with clinician → create link", async () => {
  await alex.goto(base + "/app/appointments");
  await alex.locator(".appt-row", { hasText: "Dr Priya Lee" }).first().locator("a").click();
  await alex.getByRole("heading", { name: "Dr Priya Lee" }).waitFor();
  gpUrl = alex.url();
  await alex.getByRole("button", { name: "Create share link" }).click();
  shareLink = await alex.getByLabel("Your clinician link").inputValue();
  expect(/\/c\/[A-Za-z0-9_-]{20,}$/.test(shareLink), `share link looks wrong: ${shareLink}`);
  await alex.getByRole("button", { name: "Copy", exact: true }).click();
  await alex.getByRole("button", { name: "Copied" }).waitFor();
});

const doc = await newPage("clinician");
await step("clinician (signed out) opens link, ticks a question, sends a plan", async () => {
  await doc.goto(shareLink);
  await doc.getByText("Patient pre-consult brief").first().waitFor();
  await doc.getByText("Confirmed by patient").waitFor();
  const html = await doc.content();
  expect(!/@demo\.carepath\.example/.test(html), "clinician page must not reveal the patient's email");
  await doc.getByLabel(/Could my screen time be causing the headaches/).check();
  await doc.getByText("1 of 3 addressed").waitFor();
  await doc.getByLabel("Your name and role").fill("Dr Lee, GP");
  await doc.getByLabel("After-visit instructions for the patient").fill("Blood test within 5 days. Book a review in 2 weeks. Take vitamin D 1000 IU daily. Call if headaches get worse.");
  await doc.getByRole("button", { name: /^Send to/ }).click();
  await doc.getByText(/Sent to Alex/).waitFor();
});

await step("patient sees the plan and tick; Turn into checklist prefills; Extract shows clear AI message", async () => {
  await alex.reload();
  await alex.getByText("New after-visit plan from Dr Lee, GP").waitFor();
  await alex.getByText("1 of 3 addressed").waitFor();
  await alex.getByRole("button", { name: "Turn into checklist" }).click();
  const box = alex.getByLabel("Instructions from your healthcare professional");
  await alex.waitForFunction(() => (document.querySelector(".instr textarea") as HTMLTextAreaElement | null)?.value.includes("vitamin D 1000 IU"), null, { timeout: 5000 })
    .catch(() => { throw new Error("instructions box should be prefilled with the plan"); });
  await alex.getByRole("button", { name: "Extract tasks" }).click();
  await alex.locator(".followup .alert.error").getByText(/not configured|AI/).waitFor();
  expect((await box.inputValue()).includes("vitamin D"), "text kept after AI failure");
});

await step("revoke link → clinician page shows unavailable", async () => {
  await alex.getByRole("button", { name: /^Revoke link created/ }).click();
  await text(alex, "Link revoked. It no longer works.");
  await alex.locator(".share-list").getByText("Revoked", { exact: true }).waitFor();
  await doc.reload();
  await doc.getByRole("heading", { name: "This link isn't available" }).waitFor();
});

await step("manual task: add, edit, complete, assign to Mia, delete", async () => {
  await alex.goto(gpUrl);
  const name = `E2E bring Medicare card ${Date.now() % 1000}`;
  await alex.getByLabel("Add a task yourself").fill(name);
  await alex.getByRole("button", { name: "Add", exact: true }).click();
  let row = alex.locator("li.task", { hasText: name });
  await row.waitFor();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const editing = alex.locator("li.task").filter({ has: alex.getByLabel("Task title") });
  await editing.getByLabel("Task title").fill(name + " (edited)");
  await editing.getByRole("button", { name: "Save", exact: true }).click();
  row = alex.locator("li.task", { hasText: name + " (edited)" });
  await row.locator(".task-name").waitFor();
  await row.getByRole("checkbox").click();
  await alex.waitForFunction(() => document.querySelector("li.task.done") !== null);
  expect(await row.evaluate((el) => el.classList.contains("done")), "task marked done");
  await row.getByRole("combobox", { name: /Who is doing/ }).selectOption({ label: "Mia (sister)" });
  await row.getByText("Assigned to Mia (sister)").waitFor();
  await alex.reload();
  row = alex.locator("li.task", { hasText: name + " (edited)" });
  await row.getByText("Assigned to Mia (sister)").waitFor();
  expect(await row.evaluate((el) => el.classList.contains("done")), "done survives reload");
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await row.waitFor({ state: "detached" });
  await alex.reload();
  await alex.getByRole("heading", { name: "Checklist" }).waitFor();
  expect((await alex.locator("li.task", { hasText: name }).count()) === 0, "deleted task stays deleted");
});

const carer = await newPage("carer");
const carerEmail = `carer-${Date.now()}@example.com`;
await step("care circle: create invite → new user registers via /join → accepts → sees appointments and confirmed brief (viewer)", async () => {
  await alex.goto(base + "/app/circle");
  await alex.getByLabel("Their name").fill("Sam Carer");
  await alex.getByLabel("Their email").fill(carerEmail);
  await alex.getByRole("radio", { name: /^Viewer/ }).check();
  await alex.getByRole("button", { name: "Create invite link" }).click();
  inviteLink = await alex.getByLabel("Invite link").inputValue();
  expect(/\/join\/[a-f0-9]{64}$/.test(inviteLink), `invite link looks wrong: ${inviteLink}`);

  await carer.goto(inviteLink);
  await carer.getByRole("heading", { name: /Alex Morgan invited Sam to their care circle/ }).waitFor();
  expect(!(await carer.content()).includes(carerEmail), "join page must not show emails");
  await carer.getByRole("link", { name: "Create account" }).click();
  await carer.getByLabel("Name").fill("Sam Carer");
  await carer.getByLabel("Email").fill(carerEmail);
  await carer.getByLabel("Password").fill("carer-pass-123");
  await carer.getByRole("button", { name: "Create account" }).click();
  await carer.getByRole("button", { name: /Accept as Sam Carer/ }).click();
  await carer.getByRole("heading", { name: "Alex Morgan" }).waitFor();
  await carer.getByText("Dr Priya Lee").first().waitFor();
  await carer.getByRole("button", { name: "View brief" }).first().click();
  await carer.getByText("Could my screen time be causing the headaches?").waitFor();
  await carer.getByText(/Ask Alex to make you a Helper/).waitFor();
  expect((await carer.getByRole("button", { name: "I'll take this" }).count()) === 0, "viewer must not be able to take tasks");
  expect((await carer.locator(".task input[type=checkbox]").count()) === 0, "viewer must not get checkboxes");
  const r = await carer.evaluate(async () => {
    const owner = location.pathname.split("/").pop();
    const v = await fetch(`/api/supporting/${owner}`).then((x) => x.json());
    const t = v.tasks.find((x: { status: string }) => x.status !== "completed");
    return (await fetch(`/api/supporting/${owner}/tasks/${t.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "completed" }) })).status;
  });
  expect(r === 403 || r === 404, `viewer PATCH should be refused, got ${r}`);
});

await step("owner promotes to helper → helper takes and completes a task → owner's activity feed shows it", async () => {
  await alex.reload();
  await alex.getByLabel("Role for Sam Carer").selectOption("helper");
  await text(alex, "Sam Carer is now a Helper");
  await carer.reload();
  const row = carer.locator(".task", { hasText: "Stand up slowly" });
  await row.getByRole("button", { name: "I'll take this" }).click();
  await row.getByText("You're doing this").waitFor();
  await row.getByRole("checkbox").click();
  await carer.locator(".task.done", { hasText: "Stand up slowly" }).waitFor();
  await alex.reload();
  await alex.locator(".feed").getByText(/Sam Carer/).first().waitFor();
  await alex.locator(".feed").getByText(/marked .*Stand up slowly.* done/).waitFor();
});

await step("owner removes member → supporter loses access", async () => {
  const member = alex.locator(".item", { hasText: "Sam Carer" });
  await member.getByRole("button", { name: "Remove" }).click();
  await text(alex, "Sam Carer removed");
  await carer.reload();
  await carer.getByText(/You don't have access to this care circle/).waitFor();
});

await step("demo circle: Mia's activity; People I support → Grandpa Joe's brief; take and hand back a task", async () => {
  await alex.goto(base + "/app/circle");
  await alex.locator(".feed").getByText(/took on .*Get blood test/).waitFor();
  await alex.getByRole("link", { name: /People I support/ }).click();
  await alex.getByRole("link", { name: /Grandpa Joe/ }).click();
  await alex.getByRole("heading", { name: "Grandpa Joe" }).waitFor();
  await alex.getByRole("button", { name: "View brief" }).first().click();
  await alex.getByText("Should I keep taking readings every morning?").waitFor();
  const row = alex.locator(".task", { hasText: "Arrange a lift" });
  await row.getByRole("button", { name: "I'll take this" }).click();
  await row.getByText("You're doing this").waitFor();
  await row.getByRole("button", { name: "Hand back" }).click();
  await row.getByRole("button", { name: "I'll take this" }).waitFor();
});

await step("GP appointment: preparation shows source quotes; printable brief renders", async () => {
  await alex.goto(gpUrl);
  await alex.getByRole("link", { name: "Open preparation" }).click();
  await alex.getByText("This brief is confirmed").first().waitFor();
  await alex.getByText(/Source: .*Could my screen time/).first().waitFor();
  await alex.goto(gpUrl.replace(/\/?$/, "/brief"));
  await alex.getByRole("heading", { name: "Dr Priya Lee" }).waitFor();
  await alex.getByText("Could my screen time be causing the headaches?").first().waitFor();
});

await step("Follow-up tracker and Preparation list pages load; a new draft brief can be created and deleted", async () => {
  await alex.goto(base + "/app/follow-up");
  await alex.getByRole("heading", { name: "Follow-Up Tracker" }).waitFor();
  await alex.getByText("Get blood test (FBC and iron studies)").first().waitFor();
  await alex.goto(base + "/app/preparation");
  await alex.getByRole("button", { name: "New draft brief" }).click();
  await alex.waitForURL(/\/app\/drafts\/[^/]+$/);
  await alex.getByLabel("What is your main concern?").waitFor();
  await alex.getByRole("button", { name: "Delete draft" }).click();
  await alex.getByRole("dialog").getByRole("button", { name: /Delete/ }).click();
  await alex.waitForURL(/\/app\/preparation$/);
  await text(alex, "Draft deleted");
});

await step("Fit Finder: GP near Macquarie Park with filters → compare 2", async () => {
  await alex.goto(base + "/app/fit-finder");
  await alex.getByLabel("Service type *").selectOption({ label: "General Practitioner (GP)" }).catch(async () => {
    await alex.getByLabel("Service type *").selectOption({ index: 1 });
  });
  await alex.getByLabel("Suburb or postcode").fill("Macquarie Park");
  await alex.getByRole("button", { name: "Sat", exact: true }).click().catch(() => {});
  await alex.getByRole("radio", { name: "In person" }).click();
  await alex.getByRole("button", { name: "Search", exact: true }).click();
  await alex.getByRole("heading", { name: /providers? near Macquarie Park/ }).waitFor();
  const cards = alex.locator(".provider-foot");
  expect((await cards.count()) >= 2, "need at least 2 results");
  await cards.nth(0).getByLabel("Compare").check();
  await cards.nth(1).getByLabel("Compare").check();
  await alex.getByRole("button", { name: "Compare side by side" }).click();
  await alex.getByRole("heading", { name: "Compare providers" }).waitFor();
  await alex.waitForLoadState("networkidle");
  expect(!(await alex.locator(".alert.error").count()), "compare page shows an error");
  await alex.goBack();
});

await step("Fit Finder: save search → re-run → delete", async () => {
  await alex.getByRole("heading", { name: /providers? near Macquarie Park/ }).waitFor();
  await alex.getByRole("button", { name: "Save search" }).click();
  await text(alex, "Search saved");
  await alex.goto(base + "/app/fit-finder");
  await alex.getByRole("button", { name: "E2E GP search", exact: true }).click();
  await alex.getByRole("heading", { name: /providers? near Macquarie Park/ }).waitFor();
  await alex.getByRole("button", { name: "Delete saved search E2E GP search" }).click();
  await alex.getByRole("button", { name: "E2E GP search", exact: true }).waitFor({ state: "detached" });
  await alex.reload();
  await alex.getByRole("heading", { name: /providers? near Macquarie Park/ }).waitFor();
  expect((await alex.getByRole("button", { name: "E2E GP search", exact: true }).count()) === 0, "deleted saved search came back");
});

await step("Fit Finder: Add to my appointments → prefilled form → saved", async () => {
  const card = alex.locator("article").filter({ has: alex.getByRole("button", { name: "Add to my appointments" }) }).first();
  await card.getByRole("button", { name: "Add to my appointments" }).click();
  const prac = await alex.locator('input[name="practitioner_name"]').inputValue();
  expect(prac.length > 2, "practitioner prefilled from provider");
  expect((await alex.locator('input[name="clinic_name"]').inputValue()).length > 2, "clinic prefilled");
  await alex.locator('input[name="when"]').fill("2030-03-04T09:00");
  await alex.getByRole("button", { name: "Create appointment" }).click();
  await alex.waitForURL(/\/app\/appointments\/[^/]+$/);
  await alex.getByRole("heading", { name: prac, level: 1 }).waitFor();
});

await step("AI Assistant page: send shows a graceful not-configured message", async () => {
  await alex.goto(base + "/app/assistant");
  await alex.getByPlaceholder(/Write a message/).fill("I have a GP appointment next week about headaches");
  await alex.getByRole("button", { name: "Send message" }).click();
  await alex.locator(".assistant").getByText(/not configured|AI service/).first().waitFor();
  await alex.getByRole("button", { name: "Try again" }).waitFor();
});

await step("AI Preparation: list loads; Generate brief shows graceful not-configured message", async () => {
  await alex.goto(base + "/app/preparation");
  await alex.getByRole("heading", { level: 1 }).first().waitFor();
  await alex.goto(base + "/app/appointments");
  await alex.locator(".appt-row", { hasText: "Dr Tom Nguyen" }).first().locator("a").click();
  await alex.getByRole("link", { name: "Prepare for this appointment" }).click();
  await alex.getByLabel("What is your main concern?").fill("My gum bleeds when I brush my teeth");
  await alex.getByRole("button", { name: "Generate brief" }).click();
  await alex.getByRole("alert").getByText(/not configured|AI service/).first().waitFor();
  expect((await alex.getByLabel("What is your main concern?").inputValue()).includes("gum bleeds"), "notes kept after AI failure");
});

await step("refresh persistence: imported appointments, plan and circle activity survive reload", async () => {
  await alex.goto(base + "/app/appointments");
  await alex.reload();
  await alex.locator(".appt-row", { hasText: "Dr Priya Example" }).first().waitFor();
  await alex.locator(".appt-row", { hasText: "Mei Sample" }).first().waitFor();
  await alex.goto(gpUrl);
  await alex.getByText("New after-visit plan from Dr Lee, GP").waitFor();
  await alex.goto(base + "/app/circle");
  await alex.locator(".feed").getByText(/Stand up slowly/).first().waitFor();
});

await step("carer: Settings → delete account → logged out", async () => {
  await carer.goto(base + "/app/settings");
  await carer.getByRole("button", { name: "Delete my account" }).click();
  await carer.getByRole("button", { name: "Delete everything" }).click();
  await carer.waitForURL((u) => !u.pathname.startsWith("/app"));
  await carer.goto(base + "/app");
  await carer.waitForURL((u) => !u.pathname.startsWith("/app"));
  const me = await carer.evaluate(() => fetch("/api/auth/me").then((r) => r.status));
  expect(me === 401, `deleted account still signed in (${me})`);
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
if (problems.length) console.log("Console/page problems:\n" + problems.join("\n"));
process.exit(failed.length ? 1 : 0);
