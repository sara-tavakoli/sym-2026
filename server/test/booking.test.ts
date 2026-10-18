// Booking a fictional clinic: public times, sign-in and profile gates, slot validation, double-booking, share choice.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.DATABASE_PATH = ":memory:";
delete process.env.GEMINI_API_KEY;
const { setAiClient } = await import("../src/ai/client.js");
setAiClient({
  async json() {
    return {
      reason: [{ text: "Morning headaches", field: "main_concern", quote: "Headaches most mornings" }],
      timeline: [], background: [], notes: [],
      questions: [{ text: "Should I keep a diary?", field: "questions", quote: "Should I keep a diary?" }],
    };
  },
});
let server: Server; let base = "";
after(() => { setAiClient(null); server.close(); });

class Client {
  cookie = "";
  async call(method: string, path: string, body?: unknown) {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get("set-cookie"); if (set) this.cookie = set.split(";")[0];
    return { status: r.status, data: (await r.json().catch(() => null)) as any };
  }
}
async function signup(email: string) {
  const c = new Client();
  assert.equal((await c.call("POST", "/api/auth/register", { email, password: "password123", name: "Brenda Example" })).status, 201);
  return c;
}
const profile = { date_of_birth: "1958-04-12", phone: "0400 000 000" };

let providerId = "";
let telehealthProvider = "", noTelehealthProvider = "";
before(async () => {
  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}`;
  const r = (await new Client().call("GET", "/api/fit-finder/search?category=gp&pageSize=20")).data;
  const withHours = r.items.filter((i: any) => i.provider.hours.length);
  providerId = withHours[0].provider.id;
  telehealthProvider = withHours.find((i: any) => i.provider.telehealth?.value)?.provider.id ?? "";
  noTelehealthProvider = withHours.find((i: any) => !i.provider.telehealth?.value)?.provider.id ?? "";
});

test("clinic times are public, inside published hours, in the future and on the half hour", async () => {
  const r = await new Client().call("GET", `/api/booking/providers/${providerId}`);
  assert.equal(r.status, 200);
  assert.match(r.data.notice, /fictional/);
  assert.ok(r.data.days.length > 0);
  const now = Date.now();
  for (const d of r.data.days) for (const s of d.slots) {
    assert.ok(Date.parse(s) > now);
    assert.equal(new Date(s).getUTCMinutes() % 30, 0);
  }
  assert.equal((await new Client().call("GET", "/api/booking/providers/nope")).status, 404);
});

test("booking needs an account, then a complete profile", async () => {
  const slot = (await new Client().call("GET", `/api/booking/providers/${providerId}`)).data.days[0].slots[0];
  assert.equal((await new Client().call("POST", "/api/booking", { provider_id: providerId, starts_at: slot })).status, 401);
  const c = await signup("brenda@example.com");
  assert.equal((await c.call("GET", "/api/profile")).data.complete, false);
  const r = await c.call("POST", "/api/booking", { provider_id: providerId, starts_at: slot });
  assert.equal(r.status, 422);
  assert.equal(r.data.code, "profile_required");
  assert.equal((await c.call("PUT", "/api/profile", { ...profile, date_of_birth: "2999-01-01" })).status, 400);
  assert.equal((await c.call("PUT", "/api/profile", { ...profile, phone: "call me" })).status, 400);
  assert.equal((await c.call("PUT", "/api/profile", profile)).status, 200);
  assert.equal((await c.call("GET", "/api/profile")).data.complete, true);
});

test("confirming creates an appointment with a reference; the time can't be booked twice", async () => {
  const c = await signup("book@example.com");
  await c.call("PUT", "/api/profile", profile);
  const before = (await c.call("GET", `/api/booking/providers/${providerId}`)).data;
  const slot = before.days[0].slots[0];
  const r = await c.call("POST", "/api/booking", { provider_id: providerId, starts_at: slot, reason: "Headache and unsure what to do" });
  assert.equal(r.status, 201);
  assert.match(r.data.reference, /^CP-[0-9A-F]{6}$/);
  const appt = (await c.call("GET", `/api/appointments/${r.data.appointment_id}`)).data;
  assert.equal(appt.starts_at, slot);
  assert.equal(appt.purpose, "Headache and unsure what to do");
  assert.equal(appt.booking_ref, r.data.reference);
  assert.equal(appt.prep_status, "none");
  // It is on the dashboard, and the time has gone for everyone.
  assert.ok((await c.call("GET", "/api/dashboard")).data.upcoming.some((a: any) => a.id === appt.id));
  const after = (await new Client().call("GET", `/api/booking/providers/${providerId}`)).data;
  assert.ok(!after.days.flatMap((d: any) => d.slots).includes(slot));
  const other = await signup("other@example.com");
  await other.call("PUT", "/api/profile", profile);
  const again = await other.call("POST", "/api/booking", { provider_id: providerId, starts_at: slot });
  assert.equal(again.status, 409);
  assert.equal(again.data.code, "slot_unavailable");
});

test("times outside published hours, in the past or with unsupported telehealth are refused", async () => {
  const c = await signup("rules@example.com");
  await c.call("PUT", "/api/profile", profile);
  const past = new Date(Date.now() - 864e5); past.setUTCMinutes(0, 0, 0);
  assert.equal((await c.call("POST", "/api/booking", { provider_id: providerId, starts_at: past.toISOString() })).status, 409);
  const odd = (await c.call("GET", `/api/booking/providers/${providerId}`)).data.days[0].slots[0].replace(":00:00.000Z", ":07:00.000Z").replace(":30:00.000Z", ":37:00.000Z");
  assert.equal((await c.call("POST", "/api/booking", { provider_id: providerId, starts_at: odd })).status, 409);
  if (noTelehealthProvider) {
    const slot = (await c.call("GET", `/api/booking/providers/${noTelehealthProvider}`)).data.days[0].slots[0];
    assert.equal((await c.call("POST", "/api/booking", { provider_id: noTelehealthProvider, starts_at: slot, mode: "telehealth" })).status, 400);
  }
  if (telehealthProvider) {
    const slot = (await c.call("GET", `/api/booking/providers/${telehealthProvider}`)).data.days.at(-1).slots.at(-1);
    const r = await c.call("POST", "/api/booking", { provider_id: telehealthProvider, starts_at: slot, mode: "telehealth" });
    assert.equal(r.status, 201);
    assert.equal((await c.call("GET", `/api/appointments/${r.data.appointment_id}`)).data.location, "Telehealth (video or phone)");
  }
});

test("share choice: keep private or share, owner only; creating a link records 'share'", async () => {
  const c = await signup("share@example.com");
  const a = (await c.call("POST", "/api/appointments", { starts_at: new Date(Date.now() + 3 * 864e5).toISOString(), practitioner_name: "Dr X", service_type: "GP", clinic_name: "Demo" })).data;
  assert.equal(a.share_choice, null);
  assert.equal((await c.call("PUT", `/api/appointments/${a.id}/share-choice`, { choice: "private" })).data.share_choice, "private");
  assert.equal((await c.call("PUT", `/api/appointments/${a.id}/share-choice`, { choice: "maybe" })).status, 400);
  const stranger = await signup("stranger@example.com");
  assert.equal((await stranger.call("PUT", `/api/appointments/${a.id}/share-choice`, { choice: "share" })).status, 404);
  await c.call("PUT", `/api/appointments/${a.id}/prep-notes`, { main_concern: "Headaches most mornings", onset: "", background: "", experiences: "", questions: "Should I keep a diary?", additional: "" });
  assert.equal((await c.call("POST", `/api/appointments/${a.id}/brief/generate`)).status, 200);
  const link = await c.call("POST", `/api/appointments/${a.id}/shares`, { expires_in_days: 7 });
  assert.equal(link.status, 201);
  assert.equal((await c.call("GET", `/api/appointments/${a.id}`)).data.share_choice, "share");
});
