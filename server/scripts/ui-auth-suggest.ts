// Browser check of the sign-up / sign-in type-ahead: type a letter, Enter accepts the grey suggestion and moves on,
// Enter on the finished form signs up; the account is remembered for sign-in in the same browser.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:4000";
const shots = process.env.SHOTS ?? "shots";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
const problems: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => { if (!cond) problems.push(`${name} ${detail}`); console.log(cond ? "PASS" : "FAIL", name, cond ? "" : detail); };

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15_000);
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));

await page.goto(base + "/register");
ok("sign-up starts filled (demo default)", (await page.getByLabel("Name").inputValue()) === "Brenda Example" && (await page.getByLabel("Password").inputValue()) === "carepath123");
for (const f of ["Name", "Email", "Password"]) await page.getByLabel(f).fill("");
await page.getByLabel("Name").pressSequentially("B");
await page.locator(".suggest-ghost").waitFor();
await page.screenshot({ path: `${shots}/auth-suggest-name.png` });
await page.keyboard.press("Enter");
ok("Enter accepts the name suggestion", (await page.getByLabel("Name").inputValue()) === "Brenda Example");
ok("focus moves to email", await page.getByLabel("Email").evaluate((el) => el === document.activeElement));
await page.keyboard.press("Enter");
const email = await page.getByLabel("Email").inputValue();
ok("Enter fills a unique demo email", /^brenda\.example\d{3}@example\.com$/.test(email), email);
await page.keyboard.press("Enter");
ok("Enter fills the demo password", (await page.getByLabel("Password").inputValue()) === "carepath123");
await page.keyboard.press("Enter");
await page.waitForURL(/\/app$/);
ok("Enter on the finished form creates the account", true);

// Sign out, then sign in with the type-ahead.
await page.getByRole("button", { name: "Log out" }).click();
await page.goto(base + "/login");
ok("log-in starts with the presenter account", (await page.getByLabel("Email").inputValue()) === "branda@example.com" && (await page.getByLabel("Password").inputValue()) === "12345678");
await page.getByLabel("Email").fill(""); await page.getByLabel("Password").fill("");
await page.getByLabel("Email").pressSequentially("brenda.");
await page.keyboard.press("Enter");
ok("sign-in suggests the remembered email", (await page.getByLabel("Email").inputValue()) === email, await page.getByLabel("Email").inputValue());
await page.keyboard.press("Enter");
ok("sign-in suggests its demo password", (await page.getByLabel("Password").inputValue()) === "carepath123");
await page.keyboard.press("Enter");
await page.waitForURL(/\/app$/);
ok("signed back in with three Enters", true);

// Typing a name with no suggestion: Enter moves on instead of submitting.
await page.getByRole("button", { name: "Log out" }).click();
await page.goto(base + "/register");
await page.getByLabel("Email").fill("");
await page.getByLabel("Name").fill("Thevindu Test");
await page.getByLabel("Name").press("Enter");
ok("Enter on an unsuggested name moves to email", await page.getByLabel("Email").evaluate((el) => el === document.activeElement));
await page.keyboard.press("Enter");
ok("email suggestion follows the typed name", /^thevindu\.test\d{3}@example\.com$/.test(await page.getByLabel("Email").inputValue()), await page.getByLabel("Email").inputValue());

// The presenter account logs in with the pre-filled form.
await page.goto(base + "/login");
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL(/\/app$/);
ok("pre-filled presenter log-in works", true);

await browser.close();
console.log(problems.length ? `\n${problems.length} problem(s):\n${problems.join("\n")}` : "\nAll checks passed");
process.exit(problems.length ? 1 : 0);
