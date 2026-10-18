// Consult workspace on the clinician share link: draft notes from a transcript (AI or rules), review, approve, release.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.DATABASE_PATH = ":memory:";
delete process.env.GEMINI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
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
  async call(method: string, path: string, body?: unknown) {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get("set-cookie"); if (set) this.cookie = set.split(";")[0];
    return { status: r.status, data: (await r.json().catch(() => null)) as any };
  }
}

const BRIEF = {
  reason: [{ text: "Afternoon headaches and tiredness", field: "main_concern", quote: "headaches in the afternoon" }],
  timeline: [], background: [],
  questions: [{ text: "Could screen time matter?", field: "questions", quote: "Could my screen time matter?" }],
  notes: [],
};
// What the fake AI returns for a consult draft. One instruction is invented (not in the transcript) and must be dropped.
let consultReply: unknown = null;
let summaryReply: unknown = { summary: "Get your blood test this week and book a review in two weeks." };
const fakeAi = {
  async json(req: { schema: object }) {
    const props = (req.schema as { properties: Record<string, unknown> }).properties;
    if ("instructions" in props) return consultReply;
    if ("summary" in props) return summaryReply;
    return BRIEF;
  },
};

async function sharedAppointment(email: string, purpose = "Headaches and feeling tired") {
  setAiClient(fakeAi);
  const c = new Client();
  assert.equal((await c.call("POST", "/api/auth/register", { email, password: "password123", name: "Alex Sample" })).status, 201);
  const id = (await c.call("POST", "/api/appointments", { starts_at: new Date(Date.now() + 864e5).toISOString(), practitioner_name: "Dr Priya Lee", service_type: "General Practitioner (GP)", clinic_name: "Demo Clinic", purpose })).data.id;
  await c.call("PUT", `/api/appointments/${id}/prep-notes`, { main_concern: "I keep getting headaches in the afternoon", onset: "", background: "", experiences: "", questions: "Could my screen time matter?", additional: "" });
  assert.equal((await c.call("POST", `/api/appointments/${id}/brief/generate`)).status, 200);
  const share = await c.call("POST", `/api/appointments/${id}/shares`, {});
  assert.equal(share.status, 201);
  return { c, id, token: share.data.token as string, shareId: share.data.share.id as string, doc: new Client() };
}

const draftWithRules = async (doc: Client, token: string) => {
  setAiClient(null); // no provider configured: deterministic fallback
  const sample = await doc.call("GET", `/api/share/${token}/consult/sample`);
  assert.equal(sample.status, 200);
  const r = await doc.call("POST", `/api/share/${token}/consult/draft`, { transcript: sample.data.transcript });
  assert.equal(r.status, 201);
  return r.data.consult;
};

test("rules fallback: sample transcript fits the visit, instructions keep their source sentence", async () => {
  const { doc, token } = await sharedAppointment("rules@example.com");
  const sample = (await doc.call("GET", `/api/share/${token}/consult/sample`)).data;
  assert.equal(sample.key, "gp-headaches");
  assert.match(sample.transcript, /^Dr Priya Lee: Hi Alex/);
  const c = await draftWithRules(doc, token);
  assert.equal(c.status, "draft");
  assert.equal(c.source, "rules");
  assert.equal(c.source_note, "AI not configured");
  assert.ok(c.instructions.length >= 6);
  for (const i of c.instructions) {
    assert.ok(sample.transcript.includes(i.quote), `source sentence is verbatim: ${i.quote}`);
    assert.equal(i.approved, false);
  }
  const texts = c.instructions.map((i: any) => i.text);
  assert.ok(texts.includes("Get a blood test this week for a full blood count, iron studies and thyroid function."));
  assert.ok(texts.some((t: string) => /^If you get a sudden severe headache/.test(t)));
  assert.ok(!texts.some((t: string) => /paracetamol now and then/.test(t)), "patient speech is never turned into an instruction");
  assert.match(c.notes.objective, /118 over 76/);
  assert.deepEqual(c.draft_notes, c.notes);
});

test("AI draft: untraceable and invented-medication instructions are dropped; labelled as AI", async () => {
  const { doc, token } = await sharedAppointment("ai@example.com");
  const transcript = "Dr Priya Lee: Your blood pressure is normal. Please get a blood test this week. Book a review with me in two weeks.\nAlex: Thanks.";
  consultReply = {
    notes: { subjective: "Headaches.", objective: "BP normal.", assessment: "Not discussed", plan: "Bloods, review." },
    instructions: [
      { text: "Get a blood test this week.", quote: "Please get a blood test this week." },
      { text: "Book a review in two weeks.", quote: "Book a review with me in two weeks." },
      { text: "Take ibuprofen 400 mg three times a day.", quote: "Please get a blood test this week." },
      { text: "Rest at home.", quote: "Rest at home for a week." },
    ],
  };
  setAiClient(fakeAi);
  const r = await doc.call("POST", `/api/share/${token}/consult/draft`, { transcript });
  assert.equal(r.status, 201);
  assert.equal(r.data.consult.source, "ai");
  assert.deepEqual(r.data.consult.instructions.map((i: any) => i.text), ["Get a blood test this week.", "Book a review in two weeks."]);
  assert.match(r.data.consult.source_note, /2 AI items were removed/);
  assert.equal(r.data.events.at(-1).type, "notes_drafted");
  assert.equal(r.data.events.at(-1).actor, "ai");
  assert.match(r.data.events.at(-1).message, /drafted by AI/);
});

test("AI failure falls back to rules with a clear label", async () => {
  const { doc, token } = await sharedAppointment("aifail@example.com");
  consultReply = { nonsense: true }; // fails validation twice -> AiError 502
  setAiClient(fakeAi);
  const r = await doc.call("POST", `/api/share/${token}/consult/draft`, { transcript: "Dr Priya Lee: Please book a review with me in two weeks.\nAlex: OK." });
  assert.equal(r.status, 201);
  assert.equal(r.data.consult.source, "rules");
  assert.match(r.data.consult.source_note, /^AI unavailable/);
  assert.equal(r.data.consult.instructions[0].text, "Book a review with me in two weeks.");
});

test("review state machine: edit unticks, 422 until all ticked and reviewed, 409 after approval; release creates the plan", async () => {
  const { c, id, token, doc } = await sharedAppointment("flow@example.com");
  const draft = await draftWithRules(doc, token);
  const put = (notes: any, instructions: any[]) => doc.call("PUT", `/api/share/${token}/consult`, { notes, instructions });

  // Tick everything.
  let r = await put(draft.notes, draft.instructions.map((i: any) => ({ id: i.id, text: i.text, approved: true })));
  assert.equal(r.status, 200);
  assert.ok(r.data.consult.instructions.every((i: any) => i.approved));
  assert.equal(r.data.consult.edited, false);

  // Editing one instruction unticks it on the server, even if the client says approved.
  const ins = r.data.consult.instructions.map((i: any) => ({ id: i.id, text: i.text, approved: true }));
  ins[0].text = "Get a blood test this week (full blood count, iron studies, thyroid). The form is at reception.";
  r = await put({ ...draft.notes, assessment: "Likely screen-related headaches; check iron." }, ins);
  assert.equal(r.status, 200);
  assert.equal(r.data.consult.instructions[0].approved, false);
  assert.equal(r.data.consult.instructions[1].approved, true);
  assert.equal(r.data.consult.edited, true);
  assert.equal(r.data.consult.draft_instructions[0].text, draft.instructions[0].text, "untouched draft is kept for Before / After");
  assert.equal(r.data.events.at(-1).type, "consult_edited");

  // A new instruction starts unticked.
  r = await put(r.data.consult.notes, [...r.data.consult.instructions.map((i: any) => ({ id: i.id, text: i.text, approved: i.approved })), { text: "Bring your glasses to the review.", approved: true }]);
  const added = r.data.consult.instructions.at(-1);
  assert.equal(added.approved, false);
  assert.equal(added.quote, null);

  // Approve: 422 unless reviewed and every instruction ticked.
  assert.equal((await doc.call("POST", `/api/share/${token}/consult/approve`, { author: "Dr Lee, GP", reviewed: true })).status, 422);
  r = await put(r.data.consult.notes, r.data.consult.instructions.map((i: any) => ({ id: i.id, text: i.text, approved: true })));
  assert.ok(r.data.consult.instructions.every((i: any) => i.approved));
  assert.equal((await doc.call("POST", `/api/share/${token}/consult/approve`, { author: "Dr Lee, GP", reviewed: false })).status, 422);
  assert.equal((await doc.call("POST", `/api/share/${token}/consult/approve`, { author: "", reviewed: true })).status, 400);
  setAiClient(null); // summary must come from rules
  const ok = await doc.call("POST", `/api/share/${token}/consult/approve`, { author: "Dr Lee, GP", reviewed: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.consult.status, "approved");
  assert.equal(ok.data.consult.approved_by, "Dr Lee, GP");
  assert.equal(ok.data.consult.summary_source, "rules");
  assert.match(ok.data.consult.summary, /^Dr Lee, GP reviewed your visit and approved 9 next steps/);
  assert.match(ok.data.consult.summary, /Bring your glasses to the review\./);

  // Locked.
  assert.equal((await put(draft.notes, [])).status, 409);
  assert.equal((await doc.call("POST", `/api/share/${token}/consult/approve`, { author: "Dr Lee, GP", reviewed: true })).status, 409);
  assert.equal((await doc.call("POST", `/api/share/${token}/consult/draft`, { transcript: "Dr Priya Lee: Please book a review in a week." })).status, 409);

  // Released to the patient as a clinician plan with structured instructions and the summary.
  const plans = (await c.call("GET", `/api/appointments/${id}/clinician-plans`)).data.plans;
  assert.equal(plans.length, 1);
  assert.equal(plans[0].author, "Dr Lee, GP");
  assert.equal(plans[0].imported_at, null);
  assert.equal(plans[0].instructions.length, 9);
  assert.equal(plans[0].text.split("\n")[0], ins[0].text);
  assert.equal(plans[0].summary, ok.data.consult.summary);
  assert.ok(plans[0].instructions[1].quote, "rule-drafted instructions keep their source sentence");

  // Patient imports the plan -> audit event.
  assert.equal((await c.call("POST", `/api/appointments/${id}/clinician-plans/${plans[0].id}/imported`)).status, 200);
  const events = (await c.call("GET", `/api/appointments/${id}/share-activity`)).data.events;
  assert.deepEqual(events.map((e: any) => e.type), ["link_created", "notes_drafted", "consult_edited", "approved", "plan_imported"]);
  assert.match(events[3].message, /edited from the draft.*released 9 instructions/);
});

test("AI summary on approval when configured; rejected if it invents a medication", async () => {
  const { c, id, token, doc } = await sharedAppointment("summary@example.com");
  const draft = await draftWithRules(doc, token);
  await doc.call("PUT", `/api/share/${token}/consult`, { notes: draft.notes, instructions: draft.instructions.map((i: any) => ({ id: i.id, text: i.text, approved: true })) });
  summaryReply = { summary: "Take vitamin D 1000 IU daily and get your blood test." };
  setAiClient(fakeAi);
  const r = await doc.call("POST", `/api/share/${token}/consult/approve`, { author: "Dr Lee", reviewed: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.consult.summary_source, "rules", "invented medication -> deterministic summary");
  assert.ok(!r.data.consult.summary.includes("vitamin D"));
  assert.ok((await c.call("GET", `/api/appointments/${id}/clinician-plans`)).data.plans[0].summary);
});

test("audit timeline records views and ticks; patient activity is owner-only", async () => {
  const { c, id, token, doc } = await sharedAppointment("audit@example.com");
  const view = await doc.call("GET", `/api/share/${token}`);
  await doc.call("GET", `/api/share/${token}`); // second view is not logged again
  await doc.call("POST", `/api/share/${token}/questions/${view.data.brief.sections.questions[0].id}`, { addressed: true });
  const ev = (await c.call("GET", `/api/appointments/${id}/share-activity`)).data.events;
  assert.deepEqual(ev.map((e: any) => e.type), ["link_created", "link_viewed", "question_ticked"]);
  assert.ok(ev.every((e: any) => !("user_id" in e)));
  const rows = db.prepare("SELECT DISTINCT user_id FROM share_events WHERE appointment_id = ?").all(id) as { user_id: string }[];
  assert.equal(rows.length, 1, "every row carries the patient's user_id");

  const other = new Client();
  await other.call("POST", "/api/auth/register", { email: "other@example.com", password: "password123", name: "Other Person" });
  assert.equal((await other.call("GET", `/api/appointments/${id}/share-activity`)).status, 404);
  assert.equal((await new Client().call("GET", `/api/appointments/${id}/share-activity`)).status, 401);
});

test("token security: revoked, expired and malformed links are 404 on every consult endpoint; no email leaks", async () => {
  const { c, id, token, shareId, doc } = await sharedAppointment("secure@example.com");
  const draft = await draftWithRules(doc, token);
  const all = JSON.stringify([(await doc.call("GET", `/api/share/${token}`)).data, (await doc.call("GET", `/api/share/${token}/consult`)).data, draft]);
  assert.ok(!all.includes("secure@example.com"), "patient email never exposed");

  const endpoints = (t: string) => [
    doc.call("GET", `/api/share/${t}/consult`),
    doc.call("GET", `/api/share/${t}/consult/sample`),
    doc.call("POST", `/api/share/${t}/consult/draft`, { transcript: "Dr Priya Lee: Please book a review in two weeks." }),
    doc.call("PUT", `/api/share/${t}/consult`, { notes: draft.notes, instructions: [] }),
    doc.call("POST", `/api/share/${t}/consult/approve`, { author: "Dr X", reviewed: true }),
  ];
  for (const r of await Promise.all(endpoints("not-a-token"))) assert.equal(r.status, 404);
  for (const r of await Promise.all(endpoints("a".repeat(64)))) assert.equal(r.status, 404);

  db.prepare("UPDATE appointment_shares SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), shareId);
  for (const r of await Promise.all(endpoints(token))) assert.equal(r.status, 404);

  // A fresh link sees the same consult (one per appointment); revoking it closes it again.
  const fresh = (await c.call("POST", `/api/appointments/${id}/shares`, {})).data;
  assert.equal((await doc.call("GET", `/api/share/${fresh.token}/consult`)).data.consult.id, draft.id);
  await c.call("POST", `/api/appointments/${id}/shares/${fresh.share.id}/revoke`);
  for (const r of await Promise.all(endpoints(fresh.token))) assert.equal(r.status, 404);
  const ev = (await c.call("GET", `/api/appointments/${id}/share-activity`)).data.events.map((e: any) => e.type);
  assert.ok(ev.includes("link_revoked"));
});

test("input validation and length caps", async () => {
  const { token, doc } = await sharedAppointment("caps@example.com");
  assert.equal((await doc.call("POST", `/api/share/${token}/consult/draft`, { transcript: "short" })).status, 400);
  assert.equal((await doc.call("POST", `/api/share/${token}/consult/draft`, { transcript: "x".repeat(20_001) })).status, 400);
  assert.equal((await doc.call("PUT", `/api/share/${token}/consult`, { notes: {}, instructions: [] })).status, 400);
  assert.equal((await doc.call("PUT", `/api/share/${token}/consult`, { notes: { subjective: "", objective: "", assessment: "", plan: "" }, instructions: [] })).status, 404, "nothing to edit before a draft");
  const draft = await draftWithRules(doc, token);
  const long = await doc.call("PUT", `/api/share/${token}/consult`, { notes: draft.notes, instructions: [{ text: "x".repeat(501), approved: false }] });
  assert.equal(long.status, 400);
  const tooMany = await doc.call("PUT", `/api/share/${token}/consult`, { notes: draft.notes, instructions: Array.from({ length: 21 }, () => ({ text: "Rest.", approved: false })) });
  assert.equal(tooMany.status, 400);
  assert.equal((await doc.call("PUT", `/api/share/${token}/consult`, { notes: { ...draft.notes, plan: "x".repeat(4001) }, instructions: [] })).status, 400);
});
