import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.DATABASE_PATH = ":memory:";
let server: Server;
let base = "";

before(async () => {
  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
after(() => server.close());

class Client {
  cookie = "";
  async call(method: string, path: string, body?: unknown) {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json", cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    return { status: res.status, data: (await res.json().catch(() => null)) as any };
  }
}

const future = new Date(Date.now() + 7 * 864e5).toISOString();
const past = new Date(Date.now() - 7 * 864e5).toISOString();
const appt = (starts_at: string) => ({ starts_at, practitioner_name: "Dr Example", service_type: "GP", clinic_name: "Demo Clinic" });

async function signup(email: string) {
  const c = new Client();
  const r = await c.call("POST", "/api/auth/register", { email, password: "password123", name: "Test User" });
  assert.equal(r.status, 201);
  return c;
}

test("requires authentication", async () => {
  assert.equal((await new Client().call("GET", "/api/appointments")).status, 401);
  assert.equal((await new Client().call("GET", "/api/dashboard")).status, 401);
});

test("register, duplicate email, login, wrong password, logout", async () => {
  const c = await signup("a@example.com");
  assert.equal((await c.call("GET", "/api/auth/me")).data.user.email, "a@example.com");
  assert.equal((await new Client().call("POST", "/api/auth/register", { email: "a@example.com", password: "password123", name: "X" })).status, 409);
  assert.equal((await new Client().call("POST", "/api/auth/login", { email: "a@example.com", password: "wrong-password" })).status, 401);
  const l = new Client();
  assert.equal((await l.call("POST", "/api/auth/login", { email: "a@example.com", password: "password123" })).status, 200);
  await l.call("POST", "/api/auth/logout");
  l.cookie = c.cookie; // old cookie from other session still works; logout only ends its own session
  assert.equal((await l.call("GET", "/api/auth/me")).status, 200);
});

test("appointment CRUD, validation, scopes and pagination", async () => {
  const c = await signup("crud@example.com");
  assert.equal((await c.call("POST", "/api/appointments", { ...appt(future), practitioner_name: "" })).status, 400);
  assert.equal((await c.call("POST", "/api/appointments", { ...appt("not-a-date") })).status, 400);

  const created = await c.call("POST", "/api/appointments", { ...appt(future), purpose: "Synthetic check-up" });
  assert.equal(created.status, 201);
  assert.equal(created.data.prep_status, "none");
  for (let i = 0; i < 12; i++) await c.call("POST", "/api/appointments", appt(past));

  const up = await c.call("GET", "/api/appointments?scope=upcoming");
  assert.equal(up.data.total, 1);
  const p1 = await c.call("GET", "/api/appointments?scope=past&pageSize=5&page=1");
  const p3 = await c.call("GET", "/api/appointments?scope=past&pageSize=5&page=3");
  assert.equal(p1.data.total, 12);
  assert.equal(p1.data.items.length, 5);
  assert.equal(p3.data.items.length, 2);

  const id = created.data.id;
  const upd = await c.call("PUT", `/api/appointments/${id}`, { ...appt(future), clinic_name: "Renamed Clinic" });
  assert.equal(upd.data.clinic_name, "Renamed Clinic");
  assert.equal((await c.call("DELETE", `/api/appointments/${id}`)).status, 200);
  assert.equal((await c.call("GET", `/api/appointments/${id}`)).status, 404);
});

test("users cannot read, edit or delete each other's appointments", async () => {
  const alice = await signup("alice@example.com");
  const bob = await signup("bob@example.com");
  const id = (await alice.call("POST", "/api/appointments", appt(future))).data.id;

  assert.equal((await bob.call("GET", `/api/appointments/${id}`)).status, 404);
  assert.equal((await bob.call("PUT", `/api/appointments/${id}`, appt(future))).status, 404);
  assert.equal((await bob.call("DELETE", `/api/appointments/${id}`)).status, 404);
  assert.equal((await bob.call("GET", "/api/appointments?scope=all")).data.total, 0);
  assert.equal((await bob.call("GET", "/api/dashboard")).data.counts.upcoming, 0);
  assert.equal((await alice.call("GET", `/api/appointments/${id}`)).status, 200);
});

test("new user's dashboard is genuinely empty", async () => {
  const c = await signup("empty@example.com");
  const d = (await c.call("GET", "/api/dashboard")).data;
  assert.deepEqual(d.counts, { upcoming: 0, past: 0, prepared: 0, open_tasks: 0, done_tasks: 0 });
  assert.deepEqual([d.upcoming, d.recent, d.openTasks, d.doneTasks], [[], [], [], []]);
});

test("deleting an account removes its data", async () => {
  const c = await signup("gone@example.com");
  await c.call("POST", "/api/appointments", appt(future));
  assert.equal((await c.call("DELETE", "/api/auth/account")).status, 200);
  assert.equal((await new Client().call("POST", "/api/auth/login", { email: "gone@example.com", password: "password123" })).status, 401);
});

test("session check answers 200 for signed-out visitors and returns the user when signed in", async () => {
  const anon = await new Client().call("GET", "/api/auth/session");
  assert.equal(anon.status, 200);
  assert.equal(anon.data.user, null);
  const c = await signup("session@example.com");
  assert.equal((await c.call("GET", "/api/auth/session")).data.user.email, "session@example.com");
});
