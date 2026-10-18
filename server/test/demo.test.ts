import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.DATABASE_PATH = ":memory:";
let server: Server;
let base = "";
const { db } = await import("../src/db.js");
const { purgeDemoAccounts } = await import("../src/demo.js");

before(async () => {
  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
after(() => server.close());

async function call(cookie: string, method: string, path: string) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie } });
  return { status: res.status, cookie: res.headers.get("set-cookie")?.split(";")[0] ?? cookie, data: (await res.json().catch(() => null)) as any };
}

test("a demo visitor gets a private, signed-in account with a full fictional journey", async () => {
  const r = await call("", "POST", "/api/demo");
  assert.equal(r.status, 201);
  assert.match(r.data.user.email, /@demo\.carepath\.example$/);
  const dash = await call(r.cookie, "GET", "/api/dashboard");
  assert.equal(dash.status, 200);
  assert.equal(dash.data.counts.upcoming, 2);
  assert.equal(dash.data.counts.prepared, 1);
  assert.ok(dash.data.counts.open_tasks >= 3);
  // The seeded brief is confirmed and every point is traceable to the seeded notes.
  const gp = dash.data.upcoming.find((a: { prep_status: string }) => a.prep_status === "confirmed");
  const prep = await call(r.cookie, "GET", `/api/appointments/${gp.id}/prep`);
  for (const s of Object.values(prep.data.brief.sections) as { field: string; quote: string }[][]) {
    for (const p of s) assert.ok(prep.data.notes[p.field].includes(p.quote), `untraceable: ${p.quote}`);
  }
});

test("two demo visitors never see each other's data", async () => {
  const a = await call("", "POST", "/api/demo");
  const b = await call("", "POST", "/api/demo");
  const appts = await call(a.cookie, "GET", "/api/appointments?scope=all");
  const other = await call(b.cookie, "GET", `/api/appointments/${appts.data.items[0].id}`);
  assert.equal(other.status, 404);
});

test("expired demo accounts are purged with everything they own", async () => {
  const r = await call("", "POST", "/api/demo");
  db.prepare("UPDATE users SET created_at = '2000-01-01T00:00:00.000Z' WHERE email = ?").run(r.data.user.email);
  assert.ok(purgeDemoAccounts() >= 1);
  assert.equal((await call(r.cookie, "GET", "/api/dashboard")).status, 401);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM appointments WHERE user_id = ?").get(r.data.user.id) as { n: number }).n, 0);
});

test("the demo shows both sides of the care circle", async () => {
  const r = await call("", "POST", "/api/demo");
  const circle = await call(r.cookie, "GET", "/api/circle");
  assert.equal(circle.status, 200);
  assert.ok(JSON.stringify(circle.data).includes("Mia (sister)"));
  const supporting = await call(r.cookie, "GET", "/api/supporting");
  assert.equal(supporting.data.items.length, 1);
  const joe = await call(r.cookie, "GET", `/api/supporting/${supporting.data.items[0].owner_id}`);
  assert.equal(joe.status, 200);
  assert.equal(joe.data.role, "helper");
  assert.equal(joe.data.appointments[0].brief_ready, 1);
});

test("demo appointment times are Sydney wall-clock times whatever the server's time zone", async () => {
  const { at } = await import("../src/demo.js");
  const { zonedParts, zonedDate } = await import("../src/import/tz.js");
  const now = new Date("2026-10-18T13:30:00Z"); // 19 Oct 00:30 in Sydney (AEDT), still 18 Oct in UTC
  const iso = at(1, 16, 0, now);
  const p = zonedParts(new Date(iso));
  assert.equal(zonedDate(new Date(iso)), "2026-10-20");
  assert.deepEqual([p.hour, p.minute], [16, 0]);
});

test("the demo shows follow-through: categories, a daily calendar with past ticks, and unread notifications", async () => {
  const r = await call("", "POST", "/api/demo");
  const tasks = (await call(r.cookie, "GET", "/api/tasks?status=all&pageSize=50")).data;
  const by = (s: string) => tasks.items.find((t: { source_text: string }) => t.source_text.startsWith(s));
  const iron = by("Take iron supplement");
  assert.equal(iron.category, "daily");
  assert.equal(iron.duration_days, 14);
  assert.equal(iron.title, "Take iron supplement 1 tablet daily with food."); // medication wording unchanged
  assert.equal(iron.needs_clarification, 1);
  assert.ok(iron.ticks.length >= 3 && iron.ticks.every((d: string) => d < tasks.today), "a few past days ticked, today left to tick");
  assert.equal(by("Call the clinic soon").category, "urgent");
  assert.equal(by("Blood test").category, "follow_up");
  assert.equal(by("Book a review").category, "follow_up");
  assert.equal(by("Stand up slowly").category, "daily");
  assert.ok(by("Stand up slowly").ticks.includes(tasks.today));
  // Ticking today's iron dose is allowed.
  const tick = await fetch(`${base}/api/tasks/${iron.id}/days`, { method: "POST", headers: { "content-type": "application/json", cookie: r.cookie }, body: JSON.stringify({ day: tasks.today, done: true }) });
  assert.equal(tick.status, 200);
  const notes = (await call(r.cookie, "GET", "/api/notifications")).data;
  assert.ok(notes.unread >= 2);
  assert.ok(notes.items.some((n: { message: string }) => n.message.startsWith("Mia took on")));
  assert.ok(notes.items.some((n: { message: string }) => n.message === "Dr Priya Lee viewed your brief"));
});
