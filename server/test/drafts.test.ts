// Draft briefs (preparation without an appointment) with a mocked AI client.
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.DATABASE_PATH = ":memory:";
delete process.env.GEMINI_API_KEY;
const { setAiClient } = await import("../src/ai/client.js");
const { verifyExcerpts } = await import("../src/ai/chat-notes.js");

let server: Server; let base = "";
before(async () => {
  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
after(() => server.close());
afterEach(() => setAiClient(null));

class Client {
  cookie = "";
  async call(method: string, path: string, body?: unknown) {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get("set-cookie"); if (set) this.cookie = set.split(";")[0];
    return { status: r.status, data: (await r.json().catch(() => null)) as any };
  }
}
async function user(email: string) {
  const c = new Client();
  await c.call("POST", "/api/auth/register", { email, password: "password123", name: "T" });
  return c;
}

const chat = [
  { role: "user", content: "Hi, I have an appointment soon and want help organising what to discuss" },
  { role: "assistant", content: "Of course — what's the main thing?" },
  { role: "user", content: "I keep getting headaches in the afternoon. They started about three weeks ago." },
  { role: "assistant", content: "What would you like to ask?" },
  { role: "user", content: "Could my screen time matter? Also I need to bring my glasses." },
];
const userMsgs = chat.filter((m) => m.role === "user").map((m) => m.content);

// Fake model: answers the excerpt call and the brief call differently.
function fakeAi(excerpts: unknown[]) {
  setAiClient({
    async json(req) {
      if (req.system.includes("sort a patient's own chat messages")) return { excerpts };
      return {
        reason: [{ text: "Afternoon headaches", field: "main_concern", quote: "headaches in the afternoon" }],
        timeline: [{ text: "Started three weeks ago", field: "onset", quote: "about three weeks ago" }],
        background: [], questions: [{ text: "Could screen time matter?", field: "questions", quote: "Could my screen time matter?" }],
        notes: [{ text: "Bring glasses", field: "additional", quote: "bring my glasses" }],
      };
    },
  });
}
const goodExcerpts: { field: any; message: number; quote: string }[] = [
  { field: "main_concern", message: 1, quote: "I keep getting headaches in the afternoon" },
  { field: "onset", message: 1, quote: "They started about three weeks ago" },
  { field: "questions", message: 2, quote: "Could my screen time matter?" },
  { field: "additional", message: 2, quote: "I need to bring my glasses" },
];

test("verifyExcerpts keeps verbatim excerpts only", () => {
  const r = verifyExcerpts({ excerpts: [
    ...goodExcerpts,
    { field: "background", message: 1, quote: "I have a history of migraines" }, // invented
    { field: "questions", message: 0, quote: "Could my screen time matter?" }, // wrong message
    { field: "main_concern", message: 9, quote: "headaches" }, // no such message
  ] }, userMsgs);
  assert.equal(r.kept, 4);
  assert.equal(r.dropped, 3);
  assert.equal(r.notes.background, "");
  assert.equal(r.notes.main_concern, "I keep getting headaches in the afternoon");
});

test("chat -> draft brief with source links, without storing the conversation", async () => {
  const c = await user("chatdraft@example.com");
  fakeAi([...goodExcerpts, { field: "background", message: 1, quote: "invented history" }]);
  const r = await c.call("POST", "/api/drafts/from-chat", { messages: chat });
  assert.equal(r.status, 201);
  assert.equal(r.data.origin, "chat");
  assert.equal(r.data.title, "I keep getting headaches in the afternoon");
  assert.equal(r.data.notes.background, "");
  assert.equal(r.data.brief.sections.reason[0].quote, "headaches in the afternoon");
  assert.ok(Object.values(r.data.brief.sections).flat().every((p: any) => p.field && p.quote));

  // The raw conversation (e.g. the assistant's turns and the greeting) is not stored anywhere.
  const { db } = await import("../src/db.js");
  const row = db.prepare("SELECT notes_json, content_json FROM draft_briefs WHERE id = ?").get(r.data.id) as { notes_json: string; content_json: string };
  assert.ok(!(row.notes_json + row.content_json).includes("What would you like to ask?"));
  assert.ok(!(row.notes_json + row.content_json).includes("Hi, I have an appointment soon"));
});

test("chat with no usable detail is refused, not turned into an empty brief", async () => {
  const c = await user("empty-chat@example.com");
  fakeAi([]);
  const r = await c.call("POST", "/api/drafts/from-chat", { messages: [{ role: "user", content: "hello" }] });
  assert.equal(r.status, 422);
  assert.equal((await c.call("GET", "/api/drafts")).data.items.length, 0);
});

test("form draft: notes, generate, edit (links server-side), regenerate a section", async () => {
  const c = await user("formdraft@example.com");
  fakeAi([]);
  const d = (await c.call("POST", "/api/drafts", {})).data;
  assert.equal(d.origin, "form");
  assert.equal((await c.call("POST", `/api/drafts/${d.id}/generate`)).status, 400);
  await c.call("PUT", `/api/drafts/${d.id}/notes`, { notes: { main_concern: "I keep getting headaches in the afternoon", onset: "about three weeks ago", questions: "Could my screen time matter?", additional: "bring my glasses" } });
  const g = await c.call("POST", `/api/drafts/${d.id}/generate`);
  assert.equal(g.status, 200);
  assert.equal(g.data.title, "I keep getting headaches in the afternoon");
  const reasonId = g.data.brief.sections.reason[0].id;
  const e = await c.call("PUT", `/api/drafts/${d.id}/brief`, { sections: { reason: [{ id: reasonId, text: "Headaches most afternoons" }], timeline: [], background: [{ text: "My own note" }], questions: [], notes: [] } });
  assert.equal(e.data.brief.sections.reason[0].quote, "headaches in the afternoon");
  assert.equal(e.data.brief.sections.reason[0].edited, true);
  assert.equal(e.data.brief.sections.background[0].user, true);
  assert.equal(e.data.brief.sections.background[0].quote, null);
  const regen = await c.call("POST", `/api/drafts/${d.id}/sections/questions/regenerate`);
  assert.equal(regen.data.brief.sections.reason[0].text, "Headaches most afternoons");
  assert.equal(regen.data.brief.sections.questions.length, 1);
});

test("attach draft to an appointment: copies notes, brief and source links, then removes the draft", async () => {
  const c = await user("attach@example.com");
  fakeAi(goodExcerpts);
  const d = (await c.call("POST", "/api/drafts/from-chat", { messages: chat })).data;
  const appt = (await c.call("POST", "/api/appointments", { starts_at: new Date(Date.now() + 864e5).toISOString(), practitioner_name: "Dr Example", service_type: "GP", clinic_name: "Demo" })).data;
  const a = await c.call("POST", `/api/drafts/${d.id}/attach`, { appointment_id: appt.id });
  assert.equal(a.status, 200);
  const prep = (await c.call("GET", `/api/appointments/${appt.id}/prep`)).data;
  assert.equal(prep.notes.main_concern, "I keep getting headaches in the afternoon");
  assert.equal(prep.brief.status, "draft");
  assert.equal(prep.brief.sections.reason[0].quote, "headaches in the afternoon");
  assert.equal((await c.call("GET", `/api/drafts/${d.id}`)).status, 404);

  // A second draft onto the same appointment needs explicit replacement.
  const d2 = (await c.call("POST", "/api/drafts/from-chat", { messages: chat })).data;
  const conflict = await c.call("POST", `/api/drafts/${d2.id}/attach`, { appointment_id: appt.id });
  assert.equal(conflict.status, 409);
  assert.equal((await c.call("POST", `/api/drafts/${d2.id}/attach`, { appointment_id: appt.id, replace: true })).status, 200);
});

test("drafts are private to their owner", async () => {
  const alice = await user("alice-d@example.com");
  const bob = await user("bob-d@example.com");
  fakeAi(goodExcerpts);
  const d = (await alice.call("POST", "/api/drafts/from-chat", { messages: chat })).data;
  const bobAppt = (await bob.call("POST", "/api/appointments", { starts_at: new Date(Date.now() + 864e5).toISOString(), practitioner_name: "Dr B", service_type: "GP", clinic_name: "B" })).data;
  const aliceAppt = (await alice.call("POST", "/api/appointments", { starts_at: new Date(Date.now() + 864e5).toISOString(), practitioner_name: "Dr A", service_type: "GP", clinic_name: "A" })).data;
  assert.equal((await bob.call("GET", `/api/drafts/${d.id}`)).status, 404);
  assert.equal((await bob.call("PUT", `/api/drafts/${d.id}/notes`, { notes: {} })).status, 404);
  assert.equal((await bob.call("POST", `/api/drafts/${d.id}/generate`)).status, 404);
  assert.equal((await bob.call("POST", `/api/drafts/${d.id}/attach`, { appointment_id: bobAppt.id })).status, 404);
  assert.equal((await bob.call("DELETE", `/api/drafts/${d.id}`)).status, 404);
  assert.equal((await bob.call("GET", "/api/drafts")).data.items.length, 0);
  // Alice cannot attach her draft to Bob's appointment.
  assert.equal((await alice.call("POST", `/api/drafts/${d.id}/attach`, { appointment_id: bobAppt.id })).status, 404);
  assert.equal((await alice.call("POST", `/api/drafts/${d.id}/attach`, { appointment_id: aliceAppt.id })).status, 200);
});
