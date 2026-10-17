// Live-AI browser journey for the assistant features (~7 Gemini calls, fictional data, needs GEMINI_API_KEY):
// 1) chat -> draft brief -> attach to a new appointment -> confirm
// 2) assistant provider request -> editable search summary -> Fit Finder with filters applied
// 3) Fit Finder natural-language box -> reviewed filters -> results
import { chromium, type Page } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:4000";
mkdirSync("shots", { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const page: Page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.setDefaultTimeout(150_000);
const problems: string[] = [];
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const ok = (name: string, cond: boolean, detail = "") => { if (!cond) problems.push(`${name} ${detail}`); console.log(cond ? "PASS" : "FAIL", name, cond ? "" : detail); };
const CLINICAL = /\b(you (probably|likely|might|may|could) have|sounds like you have|caused by|\d+\s?mg|you should take|diagnosis is)\b/i;
const replies = () => page.locator(".msg-assistant .msg-bubble:not(.typing)");
async function waitReply(n: number) {
  // Resolve on the reply, or fail fast with the assistant's own error message (e.g. quota or timeout).
  const err = page.locator(".assistant-error");
  await Promise.race([replies().nth(n - 1).waitFor(), err.waitFor().then(async () => { throw new Error(`assistant error: ${await err.innerText()}`); })]);
  return (await replies().nth(n - 1).innerText()).trim();
}
const input = () => page.getByLabel("Message the CarePath AI Assistant");

await page.goto(base + "/register");
await page.getByLabel("Name").fill("AI Features Tester (fictional)");
await page.getByLabel("Email").fill(`ai-features-${Date.now()}@example.com`);
await page.getByLabel("Password").fill("ai-features-pass-1");
await page.getByRole("button", { name: "Create account" }).click();
await page.getByRole("heading", { name: /(Good (morning|afternoon|evening)|Hello), AI/ }).waitFor();
await page.goto(base + "/app/assistant");
await page.getByRole("heading", { name: "CarePath AI Assistant" }).waitFor();

// ---------- 1. conversational preparation ----------
await page.locator(".assistant-chip").first().click();
const r1 = await waitReply(1);
console.log("  AI:", r1.replace(/\n/g, " / "));
ok("opening reply asks non-diagnostic questions", !CLINICAL.test(r1), r1);
ok("no brief button before any details", (await page.getByRole("button", { name: "Create a brief from this conversation" }).count()) === 0);
await input().fill("It's for a GP visit. I've had trouble sleeping for about a month since exams started, and I wake up a lot at night. I want to ask whether my study routine could matter and whether I should keep a sleep diary. I need to bring my student card.");
await page.keyboard.press("Enter");
const r2 = await waitReply(2);
console.log("  AI:", r2.replace(/\n/g, " / "));
ok("detail reply has no clinical claims", !CLINICAL.test(r2), r2);
const briefBtn = page.getByRole("button", { name: "Create a brief from this conversation" });
await briefBtn.waitFor();
ok("brief button offered after details", true);
await briefBtn.click();
await page.waitForURL(/\/app\/drafts\//);
await page.getByRole("heading", { name: "Main reason for the appointment" }).waitFor();
const sources = await page.locator(".source q").allInnerTexts();
console.log("  Draft points/quotes:", sources.length, sources.slice(0, 6));
ok("draft brief has source quotes", sources.length >= 3);
const chatText = "It's for a GP visit. I've had trouble sleeping for about a month since exams started, and I wake up a lot at night. I want to ask whether my study routine could matter and whether I should keep a sleep diary. I need to bring my student card.".toLowerCase();
ok("every quote traces to what the user typed", sources.every((q) => chatText.includes(q.toLowerCase().replace(/[“”"]/g, "").trim().replace(/[.?!]$/, ""))), JSON.stringify(sources));
const notesText = (await page.locator(".notes-card textarea").evaluateAll((ts) => ts.map((t) => (t as HTMLTextAreaElement).value))).join(" ").toLowerCase();
ok("stored notes contain no assistant wording", !/happy to help|what would you|ai preparation/.test(notesText));
await page.screenshot({ path: "shots/ai-draft.png", fullPage: true });

await page.getByRole("button", { name: "New appointment…" }).click();
await page.locator('input[name="when"]').fill("2030-05-06T10:00");
await page.locator('input[name="practitioner_name"]').fill("Dr Fictional Sleep");
await page.locator('input[name="clinic_name"]').fill("Demo Clinic");
await page.getByRole("button", { name: "Create appointment" }).click();
await page.waitForURL(/\/prepare$/);
await page.getByRole("heading", { name: "Main reason for the appointment" }).waitFor();
ok("draft attached: brief appears on the new appointment", (await page.locator(".source q").count()) >= 3);
await page.getByRole("button", { name: "Confirm brief" }).click();
await page.getByText("This brief is confirmed").waitFor();
ok("attached brief confirmed", true);

// ---------- 2. assistant -> Fit Finder handoff ----------
await page.goto(base + "/app/assistant");
await page.getByRole("button", { name: "New conversation" }).click().catch(() => {});
await input().fill("I need a dentist around Sydney who offers Saturday appointments");
await page.keyboard.press("Enter");
const r3 = await waitReply(1);
console.log("  AI:", r3.replace(/\n/g, " / "));
ok("provider reply names no clinics", !/\(Demo\)|Harbour|Chatswood Dental|Parramatta Dental/.test(r3), r3);
await page.locator(".search-summary").waitFor();
const chips = await page.locator(".search-summary .pref-chip").allInnerTexts();
console.log("  Extracted chips:", chips, "| category:", await page.locator("#ss-cat").inputValue());
ok("summary picked up Saturday and Sydney", chips.some((c) => /sat/i.test(c)) && chips.some((c) => /sydney/i.test(c)));
ok("summary picked dentist", (await page.locator("#ss-cat").inputValue()) === "dentist");
await page.getByRole("button", { name: "Find providers" }).click();
await page.waitForURL(/\/app\/fit-finder\?/);
await page.getByRole("heading", { name: /providers? near Sydney/ }).waitFor();
ok("Fit Finder opened with filters applied", /category=dentist/.test(page.url()) && /days=sat/.test(page.url()));
ok("results come from the directory (fictional labels)", (await page.locator(".provider-card .badge", { hasText: "Fictional demo" }).count()) > 0);
await page.screenshot({ path: "shots/ai-handoff.png", fullPage: true });

// ---------- 3. Fit Finder natural-language box ----------
await page.goto(base + "/app/fit-finder");
await page.getByLabel("Describe what you're looking for").fill("A GP around Macquarie Park on weekends, bulk billing if available, who speaks Mandarin");
await page.getByRole("button", { name: "Read my request" }).click();
await page.locator(".understood").waitFor();
const ev = await page.locator(".understood li").allInnerTexts();
console.log("  Evidence:", ev);
ok("form filled from request", (await page.getByLabel("Service type *").inputValue()) === "gp" && /Macquarie Park/i.test(await page.getByLabel("Suburb or postcode").inputValue()));
ok("language and bulk billing picked up", (await page.getByLabel("Language").inputValue()) === "Mandarin" && (await page.getByLabel("Bulk billing (where verified)").isChecked()));
await page.getByRole("button", { name: "Search", exact: true }).click();
await page.getByRole("heading", { name: /providers? near Macquarie Park/ }).waitFor();
const first = page.locator(".provider-card").first();
console.log("  Top result:", (await first.locator("h3").innerText()), "|", (await first.locator(".provider-why").innerText()));
ok("top result meets the language preference", (await first.locator(".check-group", { hasText: "Meets" }).innerText()).includes("Mandarin"));

await browser.close();
console.log(`\n${problems.length} problems`);
problems.forEach((p) => console.log(" -", p));
process.exit(problems.length ? 1 : 0);
