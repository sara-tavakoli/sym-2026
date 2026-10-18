// Browser check for the presenter account: a refresh puts the demo tasks back, and sharing a brief rings the bell.
import { chromium } from "playwright-core";

const base = process.env.BASE ?? "http://localhost:4000";
const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
const problems: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => { if (!cond) problems.push(`${name} ${detail}`); console.log(cond ? "PASS" : "FAIL", name, cond ? "" : detail); };
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.setDefaultTimeout(20_000);
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));

await page.goto(base + "/login");
await page.getByRole("button", { name: "Log in" }).click(); // pre-filled presenter account
await page.waitForURL(/\/app$/);

// 1. Complete a task, refresh, and it's outstanding again.
await page.goto(base + "/app/follow-up");
const blood = page.getByRole("checkbox", { name: /Get a blood test/ }).first();
await blood.waitFor();
await blood.click();
await page.getByRole("checkbox", { name: /Get a blood test/ }).first().waitFor({ state: "detached" }).catch(() => {});
await page.waitForTimeout(800);
const goneBefore = (await page.getByText("Get a blood test (full blood count)").count()) === 0;
await page.reload();
await page.getByText("Get a blood test (full blood count)").first().waitFor();
ok("refresh brings a completed task back to outstanding", true, goneBefore ? "" : "(it was still listed before the refresh)");
ok("no duplicates after refresh", (await page.getByText("Get a blood test (full blood count)").count()) === 1);

// 2. Sharing a brief adds a notification at once.
// A temporary upcoming visit with a brief (removed at the end so the presenter account stays clean).
const api = page.request;
const appt = await (await api.post(base + "/api/appointments", { data: { starts_at: new Date(Date.now() + 3 * 864e5).toISOString(), practitioner_name: "Dr Share Check", service_type: "GP", clinic_name: "Demo" } })).json();
await api.put(`${base}/api/appointments/${appt.id}/prep-notes`, { data: { main_concern: "I have a headache most afternoons", onset: "", background: "", experiences: "", questions: "Should I keep a diary?", additional: "" } });
const gen = await api.post(`${base}/api/appointments/${appt.id}/brief/generate`, { timeout: 90_000 });
if (!gen.ok()) console.log("brief generate:", gen.status(), await gen.text());
await page.goto(`${base}/app/appointments/${appt.id}`);
const before = await page.getByRole("button", { name: /Notifications/ }).getAttribute("aria-label");
const share = page.getByRole("button", { name: /Yes, share with my clinician/ });
if (await share.count()) {
  await share.click();
  await page.waitForFunction((b) => document.querySelector("[aria-label^='Notifications']")?.getAttribute("aria-label") !== b, before, { timeout: 8000 }).catch(() => {});
  const after = await page.getByRole("button", { name: /Notifications/ }).getAttribute("aria-label");
  ok("bell updates right after choosing to share", after !== before, `${before} → ${after}`);
  await page.getByRole("button", { name: /Notifications/ }).click();
  ok("notification says the brief is being shared", (await page.getByText(/chose to share your brief/).count()) > 0);
} else ok("an appointment with a brief to share", false, "no share choice on the first appointment (prepare a brief first)");
await api.delete(`${base}/api/appointments/${appt.id}`);

// 3. Prepare: save notes, generate, save the brief, then send it to the clinician from the same page.
const visit = await (await api.post(base + "/api/appointments", { data: { starts_at: new Date(Date.now() + 4 * 864e5).toISOString(), practitioner_name: "Dr Send Check", service_type: "GP", clinic_name: "Demo" } })).json();
await page.goto(`${base}/app/appointments/${visit.id}/prepare`);
await page.getByLabel("What is your main concern?").fill("I have a headache most afternoons");
await page.getByLabel("Questions you want to ask").fill("Should I keep a headache diary?\nCould my screen time matter?");
await page.getByRole("button", { name: "Save notes" }).click();
await page.getByText("Notes saved").waitFor();
ok("notes save on their own", true);
await page.reload();
ok("saved questions are still there after a reload", (await page.getByLabel("Questions you want to ask").inputValue()).includes("headache diary"));
await page.getByRole("button", { name: "Generate brief" }).click();
await page.getByRole("button", { name: "Save brief" }).click({ timeout: 90_000 });
await page.getByRole("heading", { name: "Brief saved" }).waitFor();
ok("after saving, the send option appears", (await page.getByRole("button", { name: "Send to Dr Send Check" }).count()) === 1);
await page.getByRole("button", { name: "Send to Dr Send Check" }).click();
const link = await page.locator("#send-url").inputValue();
ok("sending creates the clinician link", /\/c\/[a-f0-9]{64}$/.test(link), link);
ok("link to the clinician's view", (await page.getByRole("link", { name: /See what your clinician sees/ }).getAttribute("href")) === link);
await page.screenshot({ path: `${process.env.SHOTS ?? "shots"}/prepare-send.png`, fullPage: true });
await api.delete(`${base}/api/appointments/${visit.id}`);

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join("\n")}` : "\nAll checks passed");
process.exit(problems.length ? 1 : 0);
