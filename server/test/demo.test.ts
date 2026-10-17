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
