// Tests for the Gemini adapter using a fake SDK `models` object. No network calls, no API key, no cost.
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { ApiError } from "@google/genai";

process.env.DATABASE_PATH = ":memory:";
process.env.AI_TIMEOUT_MS = "200";
delete process.env.GEMINI_API_KEY;

const { createGeminiClient, setAiClient, generate, AiError } = await import("../src/ai/client.js");
const { generateBrief } = await import("../src/ai/brief.js");
const { extractTasks } = await import("../src/ai/tasks.js");
const { z } = await import("zod");

type Call = { model: string; contents: string; config: Record<string, unknown> };
function fakeModels(responses: (string | Error | ((c: Call) => Promise<{ text?: string }>))[]) {
  const calls: Call[] = [];
  return {
    calls,
    models: {
      async generateContent(c: Call) {
        calls.push(c);
        const r = responses[Math.min(calls.length - 1, responses.length - 1)];
        if (r instanceof Error) throw r;
        if (typeof r === "function") return r(c);
        return { text: r };
      },
    },
  };
}
afterEach(() => setAiClient(null));

const input = { main_concern: "I keep getting headaches in the afternoon", onset: "about three weeks ago", background: "", experiences: "Worse after long study sessions", questions: "Could my screen time matter?", additional: "" };

test("sends structured-output request with system prompt, JSON schema, model and abort signal", async () => {
  const f = fakeModels([JSON.stringify({ reason: [], timeline: [], background: [], questions: [], notes: [] })]);
  setAiClient(createGeminiClient(f.models, "test-flash-model"));
  await generateBrief(input);
  const c = f.calls[0];
  assert.equal(c.model, "test-flash-model");
  assert.match(c.contents, /<main_concern>\nI keep getting headaches/);
  assert.match(String(c.config.systemInstruction), /Never diagnose/);
  assert.equal(c.config.responseMimeType, "application/json");
  assert.deepEqual((c.config.responseJsonSchema as { required: string[] }).required, ["reason", "timeline", "background", "questions", "notes"]);
  assert.ok(c.config.abortSignal instanceof AbortSignal);
  assert.equal(c.config.temperature, 0.1);
  assert.deepEqual(c.config.thinkingConfig, { thinkingLevel: "LOW" });
});

test("Gemini brief output still passes through source verification and safety filters", async () => {
  const f = fakeModels([JSON.stringify({
    reason: [{ text: "Afternoon headaches", field: "main_concern", quote: "headaches in the afternoon" }],
    timeline: [{ text: "Probably caused by eye strain", field: "experiences", quote: "Worse after long study sessions" }], // clinical claim
    background: [{ text: "History of migraines", field: "background", quote: "migraines" }], // invented
    questions: [{ text: "Could my screen time matter?", field: "questions", quote: "Could my screen time matter?" }],
    notes: [],
  })]);
  setAiClient(createGeminiClient(f.models));
  const out = await generateBrief(input);
  assert.equal(out.sections.reason.length, 1);
  assert.equal(out.sections.timeline.length, 0);
  assert.equal(out.sections.background.length, 0);
  assert.equal(out.sections.questions.length, 1);
  assert.equal(out.dropped, 2);
});

test("Gemini task output keeps medication verbatim and rejects invented tasks", async () => {
  const text = "Book a review in 2 weeks. Take ibuprofen 400mg as discussed.";
  const f = fakeModels([JSON.stringify({ tasks: [
    { title: "Book review", source_text: "Book a review in 2 weeks", deadline: "in 2 weeks", needs_clarification: false, clarification_reason: null },
    { title: "Take pain relief", source_text: "Take ibuprofen 400mg as discussed", deadline: null, needs_clarification: false, clarification_reason: null },
    { title: "Drink more water", source_text: "Drink more water", deadline: null, needs_clarification: false, clarification_reason: null },
  ] })]);
  setAiClient(createGeminiClient(f.models));
  const { tasks, source } = await extractTasks(text);
  assert.equal(source, "ai");
  assert.equal(tasks.length, 2);
  assert.equal(tasks[1].title, "Take ibuprofen 400mg as discussed");
  assert.equal(tasks[1].needs_clarification, true);
  assert.equal((f.calls[0].config.responseJsonSchema as { required: string[] }).required[0], "tasks");
});

const v = z.object({ ok: z.boolean() });
const req = { system: "s", user: "u", schema: {} };

test("malformed JSON is retried once, then succeeds", async () => {
  const f = fakeModels(["not json", JSON.stringify({ ok: true })]);
  setAiClient(createGeminiClient(f.models));
  assert.deepEqual(await generate(req, v), { ok: true });
  assert.equal(f.calls.length, 2);
});

test("output that fails Zod validation twice becomes a 502", async () => {
  const f = fakeModels([JSON.stringify({ wrong: 1 })]);
  setAiClient(createGeminiClient(f.models));
  await assert.rejects(generate(req, v), (e: InstanceType<typeof AiError>) => e.status === 502);
  assert.equal(f.calls.length, 2);
});

test("SDK errors map to clean HTTP statuses", async () => {
  const cases: [Error, number][] = [
    [new ApiError({ message: "quota", status: 429 }), 429],
    [new ApiError({ message: "bad key", status: 401 }), 503],
    [new ApiError({ message: "forbidden", status: 403 }), 503],
    [new ApiError({ message: "no model", status: 404 }), 503],
    [new ApiError({ message: "boom", status: 500 }), 502],
    [new TypeError("fetch failed"), 503],
  ];
  for (const [err, status] of cases) {
    setAiClient(createGeminiClient(fakeModels([err]).models));
    await assert.rejects(generate(req, v), (e: InstanceType<typeof AiError>) => e instanceof AiError && e.status === status, `expected ${status}`);
  }
});

test("an exhausted daily quota is reported as such, not as 'try again in a minute'", async () => {
  const quota = new ApiError({ message: '{"error":{"code":429,"details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}', status: 429 });
  setAiClient(createGeminiClient(fakeModels([quota]).models));
  await assert.rejects(generate(req, v), (e: InstanceType<typeof AiError>) => e.status === 429 && /daily usage limit/.test(e.message));
});

test("requests that exceed AI_TIMEOUT_MS are aborted and return 504", async () => {
  const f = fakeModels([(c) => new Promise((_, reject) => {
    (c.config.abortSignal as AbortSignal).addEventListener("abort", () => reject(new Error("The operation was aborted")));
  })]);
  setAiClient(createGeminiClient(f.models));
  await assert.rejects(generate(req, v), (e: InstanceType<typeof AiError>) => e.status === 504);
});

test("without GEMINI_API_KEY, AI calls fail with 503 instead of crashing", async () => {
  await assert.rejects(generate(req, v), (e: InstanceType<typeof AiError>) => e.status === 503 && /GEMINI_API_KEY/.test(e.message));
});

// ---- the app runs without any AI provider configured ----
let server: Server; let base = "";
before(async () => {
  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}`;
});
after(() => server.close());

test("without a key, briefs and tasks fall back to rules-based organising; the assistant uses its rules-based guide", async () => {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { "content-type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get("set-cookie"); if (set) cookie = set.split(";")[0];
    return { status: r.status, data: (await r.json()) as any };
  };
  assert.equal((await call("POST", "/api/auth/register", { email: "nokey@example.com", password: "password123", name: "No Key" })).status, 201);
  const appt = await call("POST", "/api/appointments", { starts_at: new Date(Date.now() + 864e5).toISOString(), practitioner_name: "Dr Example", service_type: "GP", clinic_name: "Demo" });
  assert.equal(appt.status, 201);
  const id = appt.data.id;
  assert.equal((await call("PUT", `/api/appointments/${id}/prep-notes`, input)).status, 200);
  assert.equal((await call("POST", `/api/appointments/${id}/tasks`, { title: "Bring Medicare card" })).status, 201);
  assert.equal((await call("GET", "/api/dashboard")).data.counts.open_tasks, 1);
  const gen = await call("POST", `/api/appointments/${id}/brief/generate`);
  assert.equal(gen.status, 200);
  assert.equal(gen.data.source, "rules");
  assert.equal(gen.data.brief.sections.reason.length, 1);
  const ex = await call("POST", `/api/appointments/${id}/instructions/extract`, { text: "Book a review." });
  assert.equal(ex.status, 200);
  assert.deepEqual([ex.data.source, ex.data.tasks.length], ["rules", 1]);
  assert.equal((await call("POST", "/api/assistant/chat", { messages: [{ role: "user", content: "Hello" }] })).data.intent, "general");
  assert.deepEqual((await call("GET", "/api/ai/info")).data, { provider: "google-gemini", model: "gemini-3.8-flash", configured: false });
});
