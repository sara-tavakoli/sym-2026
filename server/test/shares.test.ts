// Clinician share loop: patient shares a brief, clinician views it by link, ticks questions and sends a plan back.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Server } from "node:http";

process.env.DATABASE_PATH = ":memory:";
delete process.env.GEMINI_API_KEY;
const { setAiClient } = await import("../src/ai/client.js");
const { db } = await import("../src/db.js");

let server: Server; let base = "";
before(async () => {
  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
after(() => { setAiClient(null); server.close(); });

class Client {
  cookie = "";
  headers: Headers | null = null;
  async call(method: string, path: string, body?: unknown) {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get("set-cookie"); if (set) this.cookie = set.split(";")[0];
    this.headers = r.headers;
    return { status: r.status, data: (await r.json().catch(() => null)) as any };
  }
}
async function user(email: string, name = "Alex Sample") {
  const c = new Client();
  assert.equal((await c.call("POST", "/api/auth/register", { email, password: "password123", name })).status, 201);
  return c;
}

const notes = {
  main_concern: "I keep getting headaches in the afternoon", onset: "about three weeks ago", background: "",
  experiences: "Worse after long study sessions", questions: "Could my screen time matter? Should I get my eyes checked?", additional: "",
};
setAiClient({
  async json() {
    return {
      reason: [{ text: "Afternoon headaches", field: "main_concern", quote: "headaches in the afternoon" }],
      timeline: [{ text: "Started three weeks ago", field: "onset", quote: "about three weeks ago" }],
      background: [],
      questions: [
        { text: "Could screen time matter?", field: "questions", quote: "Could my screen time matter?" },
        { text: "Should I get my eyes checked?", field: "questions", quote: "Should I get my eyes checked?" },
      ],
      notes: [],
    };
  },
});

/** A patient with an appointment and a generated (draft) brief. */
async function patientWithBrief(email: string) {
  const c = await user(email);
  const id = (await c.call("POST", "/api/appointments", { starts_at: new Date(Date.now() + 2 * 864e5).toISOString(), practitioner_name: "Dr Lee", service_type: "GP", clinic_name: "Harbour Demo Clinic" })).data.id;
  await c.call("PUT", `/api/appointments/${id}/prep-notes`, notes);
  assert.equal((await c.call("POST", `/api/appointments/${id}/brief/generate`)).status, 200);
  return { c, id };
}

test("sharing needs a brief first", async () => {
  const c = await user("nobrief@example.com");
  const id = (await c.call("POST", "/api/appointments", { starts_at: new Date().toISOString(), practitioner_name: "Dr Lee", service_type: "GP", clinic_name: "Demo" })).data.id;
  assert.equal((await c.call("POST", `/api/appointments/${id}/shares`)).status, 400);
});

test("full loop: share, public view, ticks, plan, import", async () => {
  const { c, id } = await patientWithBrief("loop@example.com");
  const created = await c.call("POST", `/api/appointments/${id}/shares`, {});
  assert.equal(created.status, 201);
  const token: string = created.data.token;
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(created.data.path, `/c/${token}`);
  assert.equal(created.data.share.status, "active");
  const days = (Date.parse(created.data.share.expires_at) - Date.now()) / 864e5;
  assert.ok(days > 6.9 && days <= 7, "default expiry is 7 days");

  // Only the hash is stored.
  const row = db.prepare("SELECT token_hash FROM appointment_shares WHERE id = ?").get(created.data.share.id) as { token_hash: string };
  assert.equal(row.token_hash, createHash("sha256").update(token).digest("hex"));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM appointment_shares WHERE token_hash = ?").get(token)!.n, 0);

  // Public view: no cookie, minimal data, privacy headers.
  const clinician = new Client();
  const view = await clinician.call("GET", `/api/share/${token}`);
  assert.equal(view.status, 200);
  assert.equal(clinician.headers!.get("referrer-policy"), "no-referrer");
  assert.match(clinician.headers!.get("x-robots-tag") ?? "", /noindex/);
  assert.equal(view.data.patient_first_name, "Alex");
  assert.ok(!JSON.stringify(view.data).includes("loop@example.com"), "email is never exposed");
  assert.equal(view.data.appointment.practitioner_name, "Dr Lee");
  assert.equal(view.data.brief.status, "draft");
  const qs = view.data.brief.sections.questions;
  assert.equal(qs.length, 2);
  assert.equal(qs[0].quote, "Could my screen time matter?");
  assert.equal(qs[0].addressed_at, null);

  // View is recorded.
  await clinician.call("GET", `/api/share/${token}`);
  const listed = (await c.call("GET", `/api/appointments/${id}/shares`)).data;
  assert.equal(listed.shares[0].view_count, 2);
  assert.ok(listed.shares[0].first_viewed_at);

  // Ticking a question persists and the patient sees it.
  assert.equal((await clinician.call("POST", `/api/share/${token}/questions/${qs[0].id}`, { addressed: true })).status, 200);
  assert.equal((await clinician.call("POST", `/api/share/${token}/questions/not-a-question`, { addressed: true })).status, 404);
  assert.ok((await clinician.call("GET", `/api/share/${token}`)).data.brief.sections.questions[0].addressed_at);
  let pq = (await c.call("GET", `/api/appointments/${id}/shares`)).data.questions;
  assert.ok(pq[0].addressed_at); assert.equal(pq[1].addressed_at, null);
  await clinician.call("POST", `/api/share/${token}/questions/${qs[0].id}`, { addressed: false });
  pq = (await c.call("GET", `/api/appointments/${id}/shares`)).data.questions;
  assert.equal(pq[0].addressed_at, null);

  // Clinician sends plans back; latest first.
  assert.equal((await clinician.call("POST", `/api/share/${token}/plan`, { author: "", text: "x" })).status, 400);
  assert.equal((await clinician.call("POST", `/api/share/${token}/plan`, { author: "Dr Lee, GP", text: "x".repeat(6001) })).status, 400);
  const sent = await clinician.call("POST", `/api/share/${token}/plan`, { author: "Dr Lee, GP", text: "Blood test this week. Book a review in 2 weeks." });
  assert.equal(sent.status, 201);
  await clinician.call("POST", `/api/share/${token}/plan`, { author: "Dr Lee, GP", text: "Call if symptoms worsen." });

  const plans = (await c.call("GET", `/api/appointments/${id}/clinician-plans`)).data.plans;
  assert.equal(plans.length, 2);
  assert.equal(plans[0].text, "Call if symptoms worsen.");
  assert.equal(plans[0].author, "Dr Lee, GP");
  assert.equal(plans[0].imported_at, null);
  assert.equal((await c.call("GET", `/api/appointments/${id}`)).data.pending_plans, 2);
  assert.equal((await c.call("GET", "/api/dashboard")).data.upcoming[0].pending_plans, 2);

  assert.equal((await c.call("POST", `/api/appointments/${id}/clinician-plans/${plans[0].id}/imported`)).status, 200);
  assert.equal((await c.call("GET", `/api/appointments/${id}`)).data.pending_plans, 1);
});

test("other users cannot list, revoke or read plans; revoked and expired links 404", async () => {
  const { c, id } = await patientWithBrief("owner@example.com");
  const mallory = await user("mallory@example.com");
  const { token, share } = (await c.call("POST", `/api/appointments/${id}/shares`, { expires_in_days: 3 })).data;

  assert.equal((await mallory.call("GET", `/api/appointments/${id}/shares`)).status, 404);
  assert.equal((await mallory.call("POST", `/api/appointments/${id}/shares`)).status, 404);
  assert.equal((await mallory.call("POST", `/api/appointments/${id}/shares/${share.id}/revoke`)).status, 404);
  assert.equal((await mallory.call("GET", `/api/appointments/${id}/clinician-plans`)).status, 404);
  assert.equal((await new Client().call("GET", `/api/appointments/${id}/shares`)).status, 401);

  // Bad input and unknown tokens look identical.
  const anon = new Client();
  assert.equal((await anon.call("GET", "/api/share/not-a-token")).status, 404);
  assert.equal((await anon.call("GET", `/api/share/${"0".repeat(64)}`)).status, 404);

  // Revoked -> 404 everywhere.
  assert.equal((await anon.call("GET", `/api/share/${token}`)).status, 200);
  const revoked = await c.call("POST", `/api/appointments/${id}/shares/${share.id}/revoke`);
  assert.equal(revoked.data.share.status, "revoked");
  assert.equal((await anon.call("GET", `/api/share/${token}`)).status, 404);
  assert.equal((await anon.call("POST", `/api/share/${token}/plan`, { author: "Dr X", text: "Hello" })).status, 404);

  // Expired -> 404.
  const second = (await c.call("POST", `/api/appointments/${id}/shares`)).data;
  db.prepare("UPDATE appointment_shares SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), second.share.id);
  assert.equal((await anon.call("GET", `/api/share/${second.token}`)).status, 404);
  assert.equal((await c.call("GET", `/api/appointments/${id}/shares`)).data.shares[0].status, "expired");

  // Deleting the appointment removes its links.
  const third = (await c.call("POST", `/api/appointments/${id}/shares`)).data;
  assert.equal((await c.call("DELETE", `/api/appointments/${id}`)).status, 200);
  assert.equal((await anon.call("GET", `/api/share/${third.token}`)).status, 404);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM appointment_shares WHERE appointment_id = ?").get(id)!.n, 0);
});
