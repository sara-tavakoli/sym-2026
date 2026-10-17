import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.DATABASE_PATH = ":memory:";
const { resolveDueDate } = await import("../src/import/due-dates.js");
const { zonedDate, addDays } = await import("../src/import/tz.js");

// Wednesday 14 Oct 2026, 11:00 in Sydney (AEDT).
const APPT = "2026-10-14T00:00:00.000Z";

test("relative deadlines resolve against the appointment date", () => {
  const due = (d: string | null) => resolveDueDate(d, APPT);
  assert.equal(due("in 2 weeks"), "2026-10-28");
  assert.equal(due("within 5 days"), "2026-10-19");
  assert.equal(due("next week"), "2026-10-21");
  assert.equal(due("in a month"), "2026-11-14");
  assert.equal(due("in a fortnight"), "2026-10-28");
  assert.equal(due("in 6 weeks' time"), "2026-11-25");
  assert.equal(due("in two weeks"), "2026-10-28");
  assert.equal(due("in 2-3 weeks"), "2026-11-04"); // ranges use the later end
  assert.equal(due("by Friday"), "2026-10-16");
  assert.equal(due("next Wednesday"), "2026-10-21"); // same weekday as the visit = a week later
  assert.equal(due("tomorrow"), "2026-10-15");
  assert.equal(due("today"), "2026-10-14");
  assert.equal(due("end of the month"), "2026-10-31");
  assert.equal(due("end of next month"), "2026-11-30");
});

test("absolute deadlines parse directly (year inferred forwards)", () => {
  const due = (d: string) => resolveDueDate(d, APPT);
  assert.equal(due("by 30 October"), "2026-10-30");
  assert.equal(due("before October 30th"), "2026-10-30");
  assert.equal(due("30/10"), "2026-10-30");
  assert.equal(due("by 5 January"), "2027-01-05");
  assert.equal(due("on 2026-12-01"), "2026-12-01");
  assert.equal(due("by 3/11/2026"), "2026-11-03");
  assert.equal(due("Friday 23 October"), "2026-10-23"); // explicit date wins over weekday
});

test("vague or missing deadlines have no due date; anchor uses the Sydney calendar date", () => {
  assert.equal(resolveDueDate("as discussed", APPT), null);
  assert.equal(resolveDueDate("soon", APPT), null);
  assert.equal(resolveDueDate(null, APPT), null);
  assert.equal(resolveDueDate("in 2 weeks", null), null);
  assert.equal(resolveDueDate("31/02", APPT), null);
  // 14:00Z on 14 Oct is 1am on 15 Oct in Sydney, so "tomorrow" is 16 Oct.
  assert.equal(resolveDueDate("tomorrow", "2026-10-14T14:00:00.000Z"), "2026-10-16");
  // Month arithmetic clamps: 31 Jan + 1 month = 28 Feb.
  assert.equal(resolveDueDate("in 1 month", "2027-01-31T01:00:00.000Z"), "2027-02-28");
});

// ---------------- API

let server: Server;
let base = "";
before(async () => {
  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
after(() => server.close());

async function call(method: string, path: string, body?: unknown, cookie = "") {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: (await res.json().catch(() => null)) as any, cookie: res.headers.get("set-cookie")?.split(";")[0] ?? "" };
}
async function signup(email: string) {
  const r = await call("POST", "/api/auth/register", { email, password: "password123", name: "Nudge Tester" });
  assert.equal(r.status, 201);
  return r.cookie;
}
const at = (ms: number) => new Date(Date.now() + ms).toISOString();
const DAY = 864e5;
const appt = (starts_at: string, name = "Dr Example") => ({ starts_at, practitioner_name: name, service_type: "General Practitioner (GP)", clinic_name: "Demo Clinic" });
const today = () => zonedDate(new Date());

test("attention endpoint: overdue, due soon, clarify, prepare now and add instructions, prioritised", async () => {
  const c = await signup("nudges@example.com");
  const past = (await call("POST", "/api/appointments", appt(at(-10 * DAY), "Dr Past"), c)).data;
  const text = "Get a blood test within 2 days. Book a review in 12 days. See the physio in 2 weeks. Call the specialist as discussed.";
  const confirm = await call("POST", `/api/appointments/${past.id}/instructions/confirm`, { text, tasks: [
    { title: "Get a blood test", source_text: "Get a blood test within 2 days", deadline: "within 2 days" },
    { title: "Book a review", source_text: "Book a review in 12 days", deadline: "in 12 days" },
    { title: "See the physio", source_text: "See the physio in 2 weeks", deadline: "in 2 weeks" },
    { title: "Call the specialist", source_text: "Call the specialist as discussed", needs_clarification: true, clarification_reason: "No specialist named" },
  ] }, c);
  assert.equal(confirm.status, 201);
  const byTitle = Object.fromEntries(confirm.data.tasks.map((t: any) => [t.title, t]));
  assert.equal(byTitle["Get a blood test"].due_date, addDays(today(), -8));
  assert.equal(byTitle["Book a review"].due_date, addDays(today(), 2));
  assert.equal(byTitle["Call the specialist"].due_date, null);

  const soon = (await call("POST", "/api/appointments", appt(at(20 * 3600e3), "Dr Soon"), c)).data;
  await call("POST", "/api/appointments", appt(at(5 * DAY), "Dr Later"), c); // outside 72h: no nudge
  const recent = (await call("POST", "/api/appointments", appt(at(-3 * DAY), "Dr Recent"), c)).data;
  await call("POST", "/api/appointments", appt(at(-30 * DAY), "Dr Old"), c); // older than 14 days: no nudge

  const r = await call("GET", "/api/dashboard/attention", undefined, c);
  assert.equal(r.status, 200);
  const kinds = r.data.items.map((i: any) => i.kind);
  assert.deepEqual(kinds, ["overdue", "prepare", "due_soon", "clarify", "add_instructions"]);
  const [overdue, prepare, dueSoon, clarify, addInstr] = r.data.items;
  assert.equal(overdue.task.days_overdue, 8);
  assert.equal(overdue.severity, "high");
  assert.equal(overdue.action.href, `/app/appointments/${past.id}#follow-up`);
  assert.equal(prepare.appointment_id, soon.id);
  assert.equal(prepare.action.href, `/app/appointments/${soon.id}/prepare`);
  assert.equal(dueSoon.task.days_until_due, 2);
  assert.equal(clarify.task.source_text, "Call the specialist as discussed");
  assert.equal(clarify.practitioner_name, "Dr Past");
  assert.equal(addInstr.appointment_id, recent.id);
  assert.equal(r.data.counts.high, 2);

  // Completing a task removes its nudge.
  await call("PATCH", `/api/tasks/${overdue.task.id}`, { status: "completed" }, c);
  const after = await call("GET", "/api/dashboard/attention", undefined, c);
  assert.ok(!after.data.items.some((i: any) => i.kind === "overdue"));
});

test("due_date follows task edits and appointment date changes; backfill fills old rows", async () => {
  const c = await signup("due-edit@example.com");
  const a = (await call("POST", "/api/appointments", appt(at(-2 * DAY)), c)).data;
  const t = (await call("POST", `/api/appointments/${a.id}/tasks`, { title: "Book an X-ray" }, c)).data;
  assert.equal(t.due_date, null);
  const edited = (await call("PATCH", `/api/tasks/${t.id}`, { deadline: "within 1 week" }, c)).data;
  const anchor = zonedDate(new Date(a.starts_at));
  assert.equal(edited.due_date, addDays(anchor, 7));
  const cleared = (await call("PATCH", `/api/tasks/${t.id}`, { deadline: null }, c)).data;
  assert.equal(cleared.due_date, null);
  await call("PATCH", `/api/tasks/${t.id}`, { deadline: "in 3 days" }, c);

  const moved = new Date(Date.parse(a.starts_at) - 7 * DAY).toISOString();
  await call("PUT", `/api/appointments/${a.id}`, appt(moved), c);
  const fu = (await call("GET", `/api/appointments/${a.id}/follow-up`, undefined, c)).data;
  assert.equal(fu.tasks[0].due_date, addDays(zonedDate(new Date(moved)), 3));

  const { db } = await import("../src/db.js");
  const { backfillDueDates } = await import("../src/schema-nudges.js");
  db.prepare("UPDATE follow_up_tasks SET due_date = NULL WHERE id = ?").run(t.id);
  assert.ok(backfillDueDates() >= 1);
  assert.equal((db.prepare("SELECT due_date FROM follow_up_tasks WHERE id = ?").get(t.id) as { due_date: string }).due_date, addDays(zonedDate(new Date(moved)), 3));
});

test("attention requires auth and never shows another user's items", async () => {
  assert.equal((await call("GET", "/api/dashboard/attention")).status, 401);
  const owner = await signup("owner-n@example.com");
  const other = await signup("other-n@example.com");
  const a = (await call("POST", "/api/appointments", appt(at(-4 * DAY)), owner)).data;
  await call("POST", `/api/appointments/${a.id}/instructions/confirm`, { text: "Get bloods done tomorrow.", tasks: [{ title: "Get bloods", source_text: "Get bloods done tomorrow", deadline: "tomorrow" }] }, owner);
  assert.ok((await call("GET", "/api/dashboard/attention", undefined, owner)).data.items.length > 0);
  const o = await call("GET", "/api/dashboard/attention", undefined, other);
  assert.equal(o.status, 200);
  assert.deepEqual(o.data.items, []);
  // The existing dashboard is unchanged by the nudges route.
  assert.equal((await call("GET", "/api/dashboard", undefined, other)).status, 200);
});
