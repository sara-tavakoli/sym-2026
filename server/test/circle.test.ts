import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Server } from "node:http";

process.env.DATABASE_PATH = ":memory:";
let server: Server;
let base = "";
let db: typeof import("../src/db.js").db;

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
      method,
      headers: { "content-type": "application/json", cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    return { status: res.status, headers: res.headers, data: (await res.json().catch(() => null)) as any };
  }
}

const future = new Date(Date.now() + 7 * 864e5).toISOString();
const appt = (starts_at: string) => ({ starts_at, practitioner_name: "Dr Example", service_type: "GP", clinic_name: "Demo Clinic" });
const empty = { reason: [], timeline: [], background: [], questions: [], notes: [] };

async function signup(email: string, name: string) {
  const c = new Client();
  const r = await c.call("POST", "/api/auth/register", { email, password: "password123", name });
  assert.equal(r.status, 201);
  return c;
}

/** Owner with one confirmed-brief appointment, one draft-brief appointment and two tasks. */
async function seedOwner(email: string) {
  const owner = await signup(email, "Rosa Patient");
  const confirmed = (await owner.call("POST", "/api/appointments", appt(future))).data.id;
  await owner.call("PUT", `/api/appointments/${confirmed}/prep-notes`, { main_concern: "SECRET-NOTE tired after lunch" });
  assert.equal((await owner.call("PUT", `/api/appointments/${confirmed}/brief`, { sections: { ...empty, reason: [{ text: "Ask about tiredness" }] } })).status, 200);
  assert.equal((await owner.call("POST", `/api/appointments/${confirmed}/brief/confirm`)).status, 200);
  const drafted = (await owner.call("POST", "/api/appointments", appt(future))).data.id;
  await owner.call("PUT", `/api/appointments/${drafted}/brief`, { sections: { ...empty, reason: [{ text: "DRAFT-ONLY point" }] } });
  const text = "Book a blood test this week. RAW-INSTRUCTION see the physio.";
  const tasks = (await owner.call("POST", `/api/appointments/${confirmed}/instructions/confirm`, {
    text, tasks: [{ title: "Book blood test", source_text: "Book a blood test this week." }, { title: "See the physio", source_text: "RAW-INSTRUCTION see the physio." }],
  })).data.tasks;
  return { owner, confirmed, drafted, taskIds: tasks.map((t: { id: string }) => t.id) as string[] };
}

async function invite(owner: Client, role: "viewer" | "helper", email = "helper@example.com") {
  const r = await owner.call("POST", "/api/circle/invites", { name: "Mia Helper", email, role });
  assert.equal(r.status, 201);
  return r.data as { token: string; path: string; invite: { id: string } };
}

test("invite -> accept -> supporter sees appointments and confirmed brief, never drafts, notes or raw instructions", async () => {
  const { owner, confirmed, drafted } = await seedOwner("rosa@example.com");
  const ownerId = (await owner.call("GET", "/api/auth/me")).data.user.id;
  const inv = await invite(owner, "viewer", "mia@example.com");
  assert.match(inv.path, /^\/join\/[a-f0-9]{64}$/);

  // Token is stored only as a SHA-256 hash.
  const row = db.prepare("SELECT token_hash FROM care_invites WHERE id = ?").get(inv.invite.id) as { token_hash: string };
  assert.notEqual(row.token_hash, inv.token);
  assert.equal(row.token_hash, createHash("sha256").update(inv.token).digest("hex"));

  // Public lookup shows who sent it, without emails.
  const look = await new Client().call("GET", `/api/circle/join/${inv.token}`);
  assert.ok(look.headers.get("ratelimit-policy") ?? look.headers.get("ratelimit-limit"), "public invite lookup is rate limited");
  assert.equal(look.status, 200);
  assert.equal(look.data.owner_name, "Rosa Patient");
  assert.equal(look.data.state, "pending");
  assert.ok(!JSON.stringify(look.data).includes("@"));
  assert.equal((await new Client().call("POST", `/api/circle/join/${inv.token}`)).status, 401);

  // Owner can't accept their own invite.
  assert.equal((await owner.call("POST", `/api/circle/join/${inv.token}`)).status, 400);

  const mia = await signup("mia@example.com", "Mia Helper");
  const acc = await mia.call("POST", `/api/circle/join/${inv.token}`);
  assert.equal(acc.status, 200);
  assert.equal(acc.data.owner_id, ownerId);
  assert.equal((await mia.call("POST", `/api/circle/join/${inv.token}`)).status, 200, "re-accepting is idempotent");
  assert.equal((await owner.call("GET", "/api/circle")).data.members.length, 1);

  const list = await mia.call("GET", "/api/supporting");
  assert.equal(list.data.items.length, 1);
  assert.equal(list.data.items[0].name, "Rosa Patient");

  const view = await mia.call("GET", `/api/supporting/${ownerId}`);
  assert.equal(view.status, 200);
  assert.equal(view.data.role, "viewer");
  assert.equal(view.data.appointments.length, 2);
  assert.equal(view.data.appointments.find((a: any) => a.id === confirmed).brief_ready, 1);
  assert.equal(view.data.appointments.find((a: any) => a.id === drafted).brief_ready, 0);
  assert.equal(view.data.tasks.length, 2);
  const dump = JSON.stringify(view.data);
  for (const secret of ["SECRET-NOTE", "RAW-INSTRUCTION", "DRAFT-ONLY", "rosa@example.com", "mia@example.com"]) assert.ok(!dump.includes(secret), secret);
  assert.ok(view.data.activity.some((a: any) => a.kind === "member_joined" && a.actor_name === "Mia Helper"));

  const brief = await mia.call("GET", `/api/supporting/${ownerId}/appointments/${confirmed}/brief`);
  assert.equal(brief.status, 200);
  assert.equal(brief.data.brief.sections.reason[0].text, "Ask about tiredness");
  assert.ok(!JSON.stringify(brief.data).includes("SECRET-NOTE"), "source quotes from notes are not shared");
  assert.equal((await mia.call("GET", `/api/supporting/${ownerId}/appointments/${drafted}/brief`)).status, 404);

  // Existing owner-only routes stay owner-only.
  assert.equal((await mia.call("GET", `/api/appointments/${confirmed}`)).status, 404);
  assert.equal((await mia.call("GET", `/api/appointments/${confirmed}/prep`)).status, 404);
  assert.equal((await mia.call("GET", `/api/appointments/${confirmed}/follow-up`)).status, 404);
});

test("viewer is read-only; helper can complete and self-assign; removal revokes access; strangers get 404", async () => {
  const { owner, taskIds } = await seedOwner("owner2@example.com");
  const ownerId = (await owner.call("GET", "/api/auth/me")).data.user.id;
  const viewer = await signup("viewer2@example.com", "Vic Viewer");
  const helper = await signup("helper2@example.com", "Hana Helper");
  const stranger = await signup("stranger2@example.com", "Sam Stranger");
  await viewer.call("POST", `/api/circle/join/${(await invite(owner, "viewer", "viewer2@example.com")).token}`);
  await helper.call("POST", `/api/circle/join/${(await invite(owner, "helper", "helper2@example.com")).token}`);

  const [t1, t2] = taskIds;
  assert.equal((await viewer.call("PATCH", `/api/supporting/${ownerId}/tasks/${t1}`, { status: "completed" })).status, 403);
  assert.equal((await viewer.call("PATCH", `/api/supporting/${ownerId}/tasks/${t1}`, { assign: "me" })).status, 403);
  assert.equal((await viewer.call("PATCH", `/api/tasks/${t1}`, { status: "completed" })).status, 404);
  assert.equal((await viewer.call("DELETE", `/api/tasks/${t1}`)).status, 404);
  assert.equal((await helper.call("DELETE", `/api/tasks/${t1}`)).status, 404, "helpers can never delete");

  const took = await helper.call("PATCH", `/api/supporting/${ownerId}/tasks/${t1}`, { assign: "me" });
  assert.equal(took.status, 200);
  assert.equal(took.data.assignee_name, "Hana Helper");
  const done = await helper.call("PATCH", `/api/supporting/${ownerId}/tasks/${t1}`, { status: "completed" });
  assert.equal(done.data.status, "completed");
  assert.equal((await helper.call("PATCH", `/api/supporting/${ownerId}/tasks/${t1}`, {})).status, 400);

  // Owner sees the assignment and the activity.
  const mine = (await owner.call("GET", "/api/tasks?status=all")).data.items;
  assert.equal(mine.find((t: any) => t.id === t1).assignee_name, "Hana Helper");
  const circle = (await owner.call("GET", "/api/circle")).data;
  assert.ok(circle.activity.some((a: any) => a.kind === "task_completed" && a.actor_name === "Hana Helper" && a.message.includes("Book blood test")));
  assert.ok(circle.activity.some((a: any) => a.kind === "task_taken"));

  // Owner can assign to helpers only, and the change is logged.
  const helperId = circle.members.find((m: any) => m.name === "Hana Helper").member_id;
  const viewerId = circle.members.find((m: any) => m.name === "Vic Viewer").member_id;
  assert.equal((await owner.call("PATCH", `/api/tasks/${t2}`, { assignee_user_id: viewerId })).status, 400);
  assert.equal((await owner.call("PATCH", `/api/tasks/${t2}`, { assignee_user_id: helperId })).data.assignee_user_id, helperId);
  assert.equal((await owner.call("GET", "/api/circle/summary")).data.tasks_taken, 1);
  assert.equal((await owner.call("GET", "/api/circle/helpers")).data.helpers.length, 1);

  // Strangers: 404 everywhere, indistinguishable from a missing person.
  assert.equal((await stranger.call("GET", `/api/supporting/${ownerId}`)).status, 404);
  assert.equal((await stranger.call("PATCH", `/api/supporting/${ownerId}/tasks/${t2}`, { status: "completed" })).status, 404);
  assert.equal((await stranger.call("GET", "/api/supporting")).data.items.length, 0);
  // Other people's circles can't be managed.
  const helperRow = circle.members.find((m: any) => m.name === "Hana Helper").id;
  assert.equal((await stranger.call("DELETE", `/api/circle/members/${helperRow}`)).status, 404);
  assert.equal((await stranger.call("PATCH", `/api/circle/members/${helperRow}`, { role: "viewer" })).status, 404);

  // Removal revokes access immediately and clears their assignments.
  assert.equal((await owner.call("DELETE", `/api/circle/members/${helperRow}`)).status, 200);
  assert.equal((await helper.call("GET", `/api/supporting/${ownerId}`)).status, 404);
  assert.equal((await helper.call("PATCH", `/api/supporting/${ownerId}/tasks/${t2}`, { status: "completed" })).status, 404);
  assert.equal((await owner.call("GET", "/api/tasks?status=all")).data.items.find((t: any) => t.id === t2).assignee_user_id, null);

  // Promote the viewer: now they can act.
  const viewerRow = circle.members.find((m: any) => m.name === "Vic Viewer").id;
  assert.equal((await owner.call("PATCH", `/api/circle/members/${viewerRow}`, { role: "helper" })).data.role, "helper");
  assert.equal((await viewer.call("PATCH", `/api/supporting/${ownerId}/tasks/${t2}`, { status: "in_progress" })).status, 200);
});

test("expired, cancelled, used and malformed invites are rejected", async () => {
  const owner = await signup("owner3@example.com", "Olive Owner");
  const joiner = await signup("joiner3@example.com", "Jo Joiner");
  const other = await signup("other3@example.com", "Oz Other");

  const cancelled = await invite(owner, "viewer", "joiner3@example.com");
  assert.equal((await owner.call("GET", "/api/circle")).data.invites.length, 1);
  assert.equal((await joiner.call("DELETE", `/api/circle/invites/${cancelled.invite.id}`)).status, 404, "only the owner can cancel");
  assert.equal((await owner.call("DELETE", `/api/circle/invites/${cancelled.invite.id}`)).status, 200);
  assert.equal((await owner.call("GET", "/api/circle")).data.invites.length, 0);
  assert.equal((await joiner.call("POST", `/api/circle/join/${cancelled.token}`)).status, 410);

  const expired = await invite(owner, "viewer", "joiner3@example.com");
  db.prepare("UPDATE care_invites SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), expired.invite.id);
  assert.equal((await new Client().call("GET", `/api/circle/join/${expired.token}`)).data.state, "expired");
  assert.equal((await joiner.call("POST", `/api/circle/join/${expired.token}`)).status, 410);

  const used = await invite(owner, "helper", "joiner3@example.com");
  assert.equal((await joiner.call("POST", `/api/circle/join/${used.token}`)).status, 200);
  assert.equal((await other.call("POST", `/api/circle/join/${used.token}`)).status, 410, "a used link can't be reused by someone else");

  assert.equal((await joiner.call("POST", `/api/circle/join/${"0".repeat(64)}`)).status, 404);
  assert.equal((await joiner.call("GET", "/api/circle/join/not-a-token")).status, 404);
  assert.equal((await owner.call("POST", "/api/circle/invites", { name: "Me", email: "owner3@example.com", role: "helper" })).status, 400);
  assert.equal((await owner.call("POST", "/api/circle/invites", { name: "X", email: "x@example.com", role: "admin" })).status, 400);
  assert.equal((await new Client().call("GET", "/api/circle")).status, 401);
});
