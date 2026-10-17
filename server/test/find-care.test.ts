// Find care that fits: deterministic, non-diagnostic service suggestion + red-flag screen (no AI, no auth).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.DATABASE_PATH = ":memory:";
delete process.env.GEMINI_API_KEY;
const { suggest, mightSuit, matchPathways, redFlag, PATHWAYS } = await import("../src/findcare/rules.js");
const { EMERGENCY_REPLY, SELF_HARM_REPLY } = await import("../src/ai/assistant.js");

const CATS = ["gp", "dentist", "physiotherapist", "psychologist", "optometrist"];
let server: Server; let base = "";
before(async () => {
  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
after(() => server.close());
const post = async (body: unknown) => {
  const r = await fetch(base + "/api/find-care/suggest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, data: (await r.json()) as any };
};

test("sore ankle after a fall suggests a physiotherapist, with a GP alternative and a quoted reason", () => {
  const s = suggest({ concern: "I have a sore ankle after a fall on the stairs", duration: "under_week", seen: "no", mode: "in_person" }, CATS);
  assert.equal(s.id, "physio");
  assert.equal(s.category, "physiotherapist");
  assert.match(s.reason, /“ankle”.*“fall”.*physiotherapists often see this; a GP can also help/);
  assert.ok(s.alternatives.some((a) => a.category === "gp"));
  assert.equal(s.mode, "in_person");
  assert.equal(s.headline, "People with similar concerns often start with a physiotherapist");
  assert.match(suggest({ concern: "blurry vision" }, CATS).headline, /an optometrist$/);
});

test("common pathways map to existing Fit Finder categories", () => {
  const cases: [string, string, string][] = [
    ["my tooth has been aching and my gums bleed", "dentist", "dentist"],
    ["my vision is blurry when reading", "optometrist", "optometrist"],
    ["a mole on my arm has changed shape", "skin", "gp"],
    ["feeling anxious and stressed, not sleeping well", "psychologist", "psychologist"],
    ["I've had a cough and fever", "gp", "gp"],
  ];
  for (const [text, id, cat] of cases) {
    const s = suggest({ concern: text }, CATS);
    assert.equal(s.id, id, text);
    assert.equal(s.category, cat, text);
  }
  for (const p of PATHWAYS) assert.ok(p.category === null || CATS.includes(p.category), p.id);
});

test("no keywords falls back to a GP; telehealth preference turns a GP into a telehealth GP", () => {
  const s = suggest({ concern: "something feels off and I'm not sure what" }, CATS);
  assert.equal(s.id, "gp");
  assert.match(s.reason, /Nothing you wrote points to a particular service/);
  const t = suggest({ concern: "sore throat and a cold", mode: "telehealth" }, CATS);
  assert.equal(t.id, "telehealth_gp");
  assert.equal(t.category, "gp");
  assert.equal(t.mode, "telehealth");
  assert.ok(t.notes.some((n) => /pharmacist/.test(n)));
});

test("a specific pathway beats the generic GP words; categories missing from the directory are never suggested", () => {
  assert.equal(matchPathways("knee pain")[0].pathway.id, "physio");
  const s = suggest({ concern: "my knee hurts" }, ["gp"]);
  assert.equal(s.category, "gp");
});

test("duration and referral answers add plain-language notes", () => {
  const s = suggest({ concern: "back pain", duration: "over_3_months", seen: "referral" }, CATS);
  assert.ok(s.notes.some((n) => /more than 3 months/.test(n)));
  assert.ok(s.notes.some((n) => /referral/.test(n)));
});

test("Might suit chips update with the words typed", () => {
  assert.deepEqual(mightSuit("tooth"), [{ id: "dentist", label: "Dentist", category: "dentist" }]);
  assert.deepEqual(mightSuit("tooth and my shoulder").map((c) => c.id).sort(), ["dentist", "physio"]);
  assert.deepEqual(mightSuit("hello"), []);
});

test("red flags reuse the assistant's emergency screen and wording", () => {
  assert.equal(redFlag("sore ankle"), null);
  assert.deepEqual(redFlag("my dad has chest pain"), { selfHarm: false, message: EMERGENCY_REPLY });
  assert.deepEqual(redFlag("I've been having suicidal thoughts"), { selfHarm: true, message: SELF_HARM_REPLY });
});

test("POST /api/find-care/suggest is public, validated and resolves the location", async () => {
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ concern: "x", duration: "forever" })).status, 400);
  assert.equal((await post({ concern: "x".repeat(1001) })).status, 400);
  const r = await post({ concern: "sore ankle after a fall", duration: "weeks", seen: "no", location: "2113", mode: "in_person" });
  assert.equal(r.status, 200);
  assert.equal(r.data.emergency, null);
  assert.equal(r.data.suggestion.category, "physiotherapist");
  assert.equal(r.data.location.known, true);
  assert.equal(r.data.location.suburb, "Macquarie Park");
  assert.equal((await post({ concern: "ankle", location: "Atlantis" })).data.location.known, false);
});

test("red flags withhold the suggestion until acknowledged", async () => {
  const r = await post({ concern: "chest pain and I can't breathe", duration: "under_week" });
  assert.equal(r.status, 200);
  assert.ok(r.data.emergency);
  assert.equal(r.data.suggestion, null);
  assert.deepEqual(r.data.chips, []);
  const ack = await post({ concern: "chest pain and I can't breathe", acknowledged_emergency: true });
  assert.ok(ack.data.emergency);
  assert.equal(ack.data.suggestion.category, "gp");
});

test("GET /api/find-care/meta lists durations and coverage", async () => {
  const m = (await (await fetch(base + "/api/find-care/meta")).json()) as any;
  assert.equal(m.durations.length, 4);
  assert.ok(m.coverage.some((l: any) => l.suburb === "Macquarie Park"));
});
