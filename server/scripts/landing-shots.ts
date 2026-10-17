// Screenshots of the public homepage (desktop + mobile, with the OS in dark mode to confirm it stays light).
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:4000";
mkdirSync("shots", { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const errors: string[] = [];
for (const [name, viewport] of [["landing-desktop", { width: 1366, height: 860 }], ["landing-mobile", { width: 390, height: 844 }]] as const) {
  const page = await (await browser.newContext({ viewport, colorScheme: "dark" })).newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/status of 401/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  await page.goto(base + "/");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log(name, overflow ? "HORIZONTAL OVERFLOW" : "no overflow");
  await page.screenshot({ path: `shots/${name}.png`, fullPage: true });
  await page.screenshot({ path: `shots/${name}-fold.png` });
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "no console errors");
