// End-to-end MVP journey through the real UI with the real AI (Gemini; needs GEMINI_API_KEY), on a fresh fictional account.
import { chromium } from "playwright-core";

const base = process.env.BASE ?? "http://localhost:4000";
const browser = await chromium.launch({ channel: "msedge" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.setDefaultTimeout(200_000);
let n = 0;
const step = (s: string) => console.log(`${++n}. ${s}`);
const email = `journey-${Date.now()}@example.com`;

await page.goto(base + "/register");
await page.getByLabel("Name").fill("Journey Tester");
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill("journey-pass-1");
await page.getByRole("button", { name: "Create account" }).click();
await page.getByRole("heading", { name: /(Good (morning|afternoon|evening)|Hello), Journey/ }).waitFor();
step("registered and landed on an empty dashboard");
if ((await page.getByText("No upcoming appointments").count()) < 1) throw new Error("new user dashboard not empty");

await page.goto(base + "/app/appointments?new=1");
await page.locator('input[name="when"]').fill("2030-03-04T09:00");
await page.locator('input[name="practitioner_name"]').fill("Dr Fictional Example");
await page.locator('input[name="clinic_name"]').fill("Demo Clinic");
await page.getByRole("button", { name: "Create appointment" }).click();
await page.getByText("Dr Fictional Example").first().click();
step("created appointment");

await page.getByRole("link", { name: "Prepare for this appointment" }).click();
await page.getByLabel("What is your main concern?").fill("I have been feeling very tired during the day");
await page.getByLabel("When did it start?").fill("since the start of exams, about a month ago");
await page.getByLabel("What have you noticed or experienced?").fill("I wake up often at night. Coffee doesn't seem to help.");
await page.getByLabel("Questions you want to ask").fill("Could my sleep routine be a factor?\nShould I have a blood test?");
await page.getByRole("button", { name: "Generate brief" }).click();
await page.getByRole("heading", { name: "Timeline" }).waitFor();
step("AI generated a brief from the form");
await page.getByText(/Source: /).first().waitFor();
const textareas = page.getByRole("textbox", { name: /Questions for the practitioner point/ });
const before = await textareas.count();
await textareas.first().fill("Could my sleep routine be a factor? (edited by me)");
await page.getByRole("button", { name: "Delete point" }).last().click();
await page.getByRole("button", { name: "Save edits" }).click();
await page.getByText("Edits saved").waitFor();
step(`edited and saved brief (questions ${before} -> ${await textareas.count()}, one deleted somewhere)`);
await page.getByRole("button", { name: "Confirm brief" }).click();
await page.getByText("This brief is confirmed").waitFor();
step("confirmed brief");
await page.reload();
await page.getByText("(edited by me)").waitFor();
step("brief + edit survived a page refresh");
await page.getByRole("button", { name: "Open printable brief" }).click();
await page.getByRole("heading", { name: "Dr Fictional Example" }).waitFor();
await page.getByText("(edited by me)").waitFor();
step("printable one-page brief renders");

await page.goto(base + "/app/appointments");
await page.getByText("Dr Fictional Example").first().click();
await page.getByLabel("Instructions from your healthcare professional").fill("Book a follow-up appointment in 2 weeks. Get a blood test at Pathology Plus. Take melatonin 3mg as discussed.");
await page.getByRole("button", { name: "Extract tasks" }).click();
await page.getByRole("heading", { name: "Review before saving" }).waitFor();
step("AI extracted tasks for review (nothing saved yet)");
await page.getByText("Medication wording kept exactly as entered").waitFor();
await page.getByRole("button", { name: /^Confirm \d+ tasks?$/ }).click();
await page.getByText(/tasks? saved/).waitFor();
step("confirmed tasks");
await page.getByRole("checkbox").first().click();
await page.getByText("1 open · 1 done").or(page.getByText(/\d+ open · [1-9]\d* done/)).waitFor();
step("marked a task completed");

await page.reload();
await page.getByText(/\d+ open · [1-9]\d* done/).waitFor();
await page.goto(base + "/app");
await page.getByRole("heading", { name: "Completed tasks" }).waitFor();
if ((await page.locator(".badge.ok", { hasText: "Done" }).count()) < 1) throw new Error("completed task missing on dashboard after refresh");
step("after refresh the dashboard still shows saved appointment, brief status and completed task");
await browser.close();
console.log("\nJOURNEY OK");
