// Follow-through: task categories, daily care calendar ticks, and in-app notifications.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.DATABASE_PATH = ":memory:";
let server: Server;
let base = "";
let db: typeof import("../src/db.js").db;
const { classifyTask, parseDuration } = await import("../src/categories.js");
const { addDays, zonedDate } = await import("../src/import/tz.js");

before(async () => {
  const { createApp } = await import("../src/app.js");
  db = (await import("../src/db.js")).db;
  server = createApp().listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
after(() => server.close());

class Client {
  cookie = "";
  async call(method: string, path: string, body?: unknown) {
    const res = await fetch(base + path, {
      method, headers: { "content-type": "application/json", cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    return { status: res.status, data: (await res.json().catch(() => null)) as any };
  }
}
async function signup(email: string, name = "Test Patient") {
  const c = new Client();
  assert.equal((await c.call("POST", "/api/auth/register", { email, password: "password123", name })).status, 201);
  return c;
}
const today = () => zonedDate(new Date());
const past = new Date(Date.now() - 3 * 864e5).toISOString();
const appt = { starts_at: past, practitioner_name: "Dr Example", service_type: "GP", clinic_name: "Demo Clinic" };

const TEXT = [
  "Take iron supplement 1 tablet daily with food for 7 days.",
  "Call 000 immediately if you have chest pain.",
  "Book a review appointment in 2 weeks.",
  "Pick up your glasses from the optometrist.",
  "Stand up slowly and drink more water.",
].join("\n");

async function seed(email: string) {
  const c = await signup(email);
  const id = (await c.call("POST", "/api/appointments", appt)).data.id;
  const r = await c.call("POST", `/api/appointments/${id}/instructions/confirm`, {
    text: TEXT, tasks: TEXT.split("\n").map((l) => ({ title: l, source_text: l, deadline: l.includes("in 2 weeks") ? "in 2 weeks" : null })),
  });
  assert.equal(r.status, 201);
  return { c, apptId: id, tasks: r.data.tasks as any[] };
}

test("classification rules: urgent, daily, follow-up, one-time and durations", () => {
  const cat = (s: string) => classifyTask(s).category;
  assert.equal(cat("Take iron supplement 1 tablet daily with food."), "daily");
  assert.equal(cat("Apply the cream every morning"), "daily");
  assert.equal(cat("Use the inhaler twice a day"), "daily");
  assert.equal(cat("Do the stretches each night"), "daily");
  assert.equal(cat("Stand up slowly and drink more water."), "daily");
  assert.equal(cat("Call the clinic soon if the dizziness gets worse."), "urgent");
  assert.equal(cat("If the pain spreads, go to ED"), "urgent");
  assert.equal(cat("Call 000 if you have trouble breathing"), "urgent");
  assert.equal(cat("Seek urgent care if the fever returns"), "urgent");
  assert.equal(cat("Book a review appointment with me in 2 weeks."), "follow_up");
  assert.equal(cat("Blood test (FBC and iron studies) within 5 days."), "follow_up");
  assert.equal(cat("Get a referral to the physio"), "follow_up");
  assert.equal(cat("Have an ultrasound scan"), "follow_up");
  assert.equal(cat("Pick up your glasses"), "one_time");
  assert.equal(parseDuration("Take antibiotics for 7 days"), 7);
  assert.equal(parseDuration("rest your ankle for two weeks"), 14);
  assert.equal(parseDuration("for a fortnight"), 14);
  assert.equal(parseDuration("Pick up glasses"), null);
  assert.deepEqual(classifyTask("Take one tablet daily for two weeks"), { category: "daily", duration_days: 14 });
  assert.deepEqual(classifyTask("Use eye drops twice a day"), { category: "daily", duration_days: 7 }); // default
  assert.equal(classifyTask("Book a scan").duration_days, null);
});

test("confirmed tasks are categorised server-side; daily tasks get a Sydney date range; wording is unchanged", async () => {
  const { tasks } = await seed("cat@example.com");
  assert.deepEqual(tasks.map((t) => t.category), ["daily", "urgent", "follow_up", "one_time", "daily"]);
  const [iron, , , , water] = tasks;
  assert.equal(iron.title, "Take iron supplement 1 tablet daily with food for 7 days."); // verbatim
  assert.equal(iron.start_date, today());
  assert.equal(iron.duration_days, 7);
  assert.equal(iron.end_date, addDays(today(), 6));
  assert.equal(water.duration_days, 7);
  assert.deepEqual(iron.ticks, []);
  assert.equal(tasks[2].start_date, null);
  assert.ok(tasks[2].due_date, "follow-up keeps the due_date logic");
});

test("a category chosen at review wins and is marked as the patient's; the patient can change it later", async () => {
  const c = await signup("choose@example.com");
  const id = (await c.call("POST", "/api/appointments", appt)).data.id;
  const r = await c.call("POST", `/api/appointments/${id}/instructions/confirm`, {
    text: "Pick up your glasses.", tasks: [{ title: "Pick up glasses", source_text: "Pick up your glasses.", category: "daily", duration_days: 3 }],
  });
  const t = r.data.tasks[0];
  assert.equal(t.category, "daily");
  assert.equal(t.category_manual, 1);
  assert.equal(t.end_date, addDays(today(), 2));
  const p = await c.call("PATCH", `/api/tasks/${t.id}`, { category: "follow_up" });
  assert.equal(p.data.category, "follow_up");
  assert.equal(p.data.start_date, null);
  const back = await c.call("PATCH", `/api/tasks/${t.id}`, { category: "daily", duration_days: 10 });
  assert.equal(back.data.end_date, addDays(back.data.start_date, 9));
  assert.equal((await c.call("PATCH", `/api/tasks/${t.id}`, { category: "weekly" })).status, 400);
  const manual = await c.call("POST", `/api/appointments/${id}/tasks`, { title: "Take tablets every morning" });
  assert.equal(manual.data.category, "daily");
  // Filter by category.
  const list = await c.call("GET", "/api/tasks?status=all&category=daily");
  assert.ok(list.data.items.every((x: any) => x.category === "daily"));
  assert.equal(list.data.today, today());
});

test("startup backfill categorises rows created before the migration", async () => {
  const { tasks } = await seed("backfill@example.com");
  db.prepare("UPDATE follow_up_tasks SET category = NULL, duration_days = NULL, start_date = NULL, end_date = NULL WHERE id = ?").run(tasks[0].id);
  const { backfillCategories } = await import("../src/schema-followthrough.js");
  assert.ok(backfillCategories() >= 1);
  const row = db.prepare("SELECT category, duration_days, start_date, end_date FROM follow_up_tasks WHERE id = ?").get(tasks[0].id) as any;
  assert.deepEqual({ ...row }, { category: "daily", duration_days: 7, start_date: today(), end_date: addDays(today(), 6) });
});

test("day ticks: 422 for future, out-of-range and non-daily tasks; auto-complete when every day is ticked", async () => {
  const { c, tasks } = await seed("ticks@example.com");
  const iron = tasks[0];
  const tick = (id: string, day: string, done = true) => c.call("POST", `/api/tasks/${id}/days`, { day, done });
  assert.equal((await tick(iron.id, addDays(today(), 1))).status, 422, "future day");
  assert.equal((await tick(iron.id, addDays(today(), -1))).status, 422, "before start");
  assert.equal((await tick(tasks[3].id, today())).status, 422, "one-time task");
  assert.equal((await tick(iron.id, "18-10-2026")).status, 400);
  const r = await tick(iron.id, today());
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.ticks, [today()]);
  assert.equal(r.data.status, "in_progress");
  assert.equal((await tick(iron.id, today(), false)).data.ticks.length, 0);

  // Move the range into the past so every day can be ticked.
  const start = addDays(today(), -2);
  db.prepare("UPDATE follow_up_tasks SET start_date = ?, end_date = ?, duration_days = 3 WHERE id = ?").run(start, today(), iron.id);
  await tick(iron.id, start);
  await tick(iron.id, addDays(today(), -1));
  const done = await tick(iron.id, today());
  assert.equal(done.data.status, "completed");
  assert.equal(done.data.ticks.length, 3);
  const reopened = await tick(iron.id, start, false);
  assert.equal(reopened.data.status, "in_progress");
});

test("other users cannot tick, change category or see ticks (404)", async () => {
  const { tasks } = await seed("owner-ft@example.com");
  const other = await signup("intruder-ft@example.com");
  assert.equal((await other.call("POST", `/api/tasks/${tasks[0].id}/days`, { day: today(), done: true })).status, 404);
  assert.equal((await other.call("PATCH", `/api/tasks/${tasks[0].id}`, { category: "urgent" })).status, 404);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM task_day_ticks WHERE task_id = ?").get(tasks[0].id) as { n: number }).n, 0);
  assert.equal((await new Client().call("GET", "/api/notifications")).status, 401);
});

test("notifications: helper events, overdue (deduplicated), read state, scoped per user", async () => {
  const { c, apptId, tasks } = await seed("notes@example.com");
  const ownerId = (await c.call("GET", "/api/auth/me")).data.user.id;
  // Helper takes on and completes a task.
  const inv = (await c.call("POST", "/api/circle/invites", { name: "Mia", email: "mia-ft@example.com", role: "helper" })).data;
  const mia = await signup("mia-ft@example.com", "Mia");
  assert.equal((await mia.call("POST", `/api/circle/join/${inv.token}`)).status, 200);
  assert.equal((await mia.call("PATCH", `/api/supporting/${ownerId}/tasks/${tasks[3].id}`, { assign: "me" })).status, 200);
  assert.equal((await mia.call("PATCH", `/api/supporting/${ownerId}/tasks/${tasks[3].id}`, { status: "completed" })).status, 200);

  // An overdue follow-up: lazily notified once per day however often it is computed.
  db.prepare("UPDATE follow_up_tasks SET due_date = ? WHERE id = ?").run(addDays(today(), -2), tasks[2].id);
  await c.call("GET", "/api/dashboard/attention");
  const r = await c.call("GET", "/api/notifications");
  assert.equal(r.status, 200);
  const kinds = r.data.items.map((n: any) => n.kind).sort();
  assert.deepEqual(kinds, ["task_completed", "task_overdue", "task_taken"]);
  assert.equal(r.data.unread, 3);
  assert.match(r.data.items.find((n: any) => n.kind === "task_taken").message, /^Mia took on/);
  assert.ok(r.data.items.every((n: any) => n.link.startsWith(`/app/appointments/${apptId}`)));

  // Mia sees none of Alex's notifications, and cannot mark them read.
  const miaList = await mia.call("GET", "/api/notifications");
  assert.equal(miaList.data.items.length, 0);
  const first = r.data.items[0].id;
  assert.equal((await mia.call("POST", `/api/notifications/${first}/read`)).status, 404);
  await mia.call("POST", "/api/notifications/read-all");
  assert.equal((await c.call("GET", "/api/notifications")).data.unread, 3);

  const one = await c.call("POST", `/api/notifications/${first}/read`);
  assert.equal(one.data.unread, 2);
  assert.ok(one.data.items.find((n: any) => n.id === first).read_at);
  const all = await c.call("POST", "/api/notifications/read-all");
  assert.equal(all.data.unread, 0);
  assert.equal((await c.call("GET", "/api/notifications")).data.items.length, 3, "overdue not duplicated the same day");
});

test("clinician viewing a brief and sending a plan notifies the patient", async () => {
  const c = await signup("share-ft@example.com");
  const id = (await c.call("POST", "/api/appointments", { ...appt, starts_at: new Date(Date.now() + 864e5).toISOString() })).data.id;
  const empty = { reason: [], timeline: [], background: [], questions: [], notes: [] };
  await c.call("PUT", `/api/appointments/${id}/brief`, { sections: { ...empty, reason: [{ text: "Ask about tiredness" }] } });
  const token = (await c.call("POST", `/api/appointments/${id}/shares`, {})).data.token;
  const clinician = new Client();
  assert.equal((await clinician.call("GET", `/api/share/${token}`)).status, 200);
  await clinician.call("GET", `/api/share/${token}`); // a second view the same day is not a second notification
  assert.equal((await clinician.call("POST", `/api/share/${token}/plan`, { author: "Dr Example, GP", text: "Book a review in 2 weeks." })).status, 201);
  const n = (await c.call("GET", "/api/notifications")).data;
  assert.deepEqual(n.items.filter((x: any) => x.kind !== "brief_shared").map((x: any) => x.message).sort(), ["Dr Example viewed your brief", "Dr Example, GP sent your after-visit plan"]);
  assert.equal(n.items.filter((x: any) => x.kind === "brief_shared").length, 1, "creating the link notified the patient too");
});
