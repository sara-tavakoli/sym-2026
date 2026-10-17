import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";

process.env.DATABASE_PATH = ":memory:";
const { createClaudeClient, withFallback, strictSchema, setAiClient, generate, AiError } = await import("../src/ai/client.js");
const { z } = await import("zod");

const req = { system: "sys", user: "hello", schema: { type: "object", properties: { a: { type: "object", properties: { b: { type: "string" } } } } } };
const signal = new AbortController().signal;

function fakeMessages(reply: () => unknown) {
  const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  return {
    calls,
    messages: {
      async create(params: Anthropic.Beta.MessageCreateParamsNonStreaming) {
        calls.push(params);
        return reply() as Anthropic.Beta.BetaMessage;
      },
    },
  };
}
const message = (text: string, stop_reason = "end_turn") => ({ content: [{ type: "text", text }], stop_reason });

test("strictSchema adds additionalProperties: false to every object", () => {
  const s = strictSchema(req.schema) as { additionalProperties: boolean; properties: { a: { additionalProperties: boolean } } };
  assert.equal(s.additionalProperties, false);
  assert.equal(s.properties.a.additionalProperties, false);
});

test("Claude adapter sends a strict JSON schema and parses the text block", async () => {
  const f = fakeMessages(() => message('{"a":{"b":"ok"}}'));
  const out = await createClaudeClient(f.messages, "test-model").json(req, signal);
  assert.deepEqual(out, { a: { b: "ok" } });
  assert.equal(f.calls[0].model, "test-model");
  assert.equal(f.calls[0].output_config?.format?.type, "json_schema");
  assert.equal((f.calls[0].output_config?.format?.schema as { additionalProperties: boolean }).additionalProperties, false);
});

test("a refusal maps to a clean 422", async () => {
  const f = fakeMessages(() => message("", "refusal"));
  await assert.rejects(createClaudeClient(f.messages).json(req, signal), (e) => e instanceof AiError && e.status === 422);
});

test("SDK errors map to clean HTTP statuses", async () => {
  const f = fakeMessages(() => { throw new Anthropic.RateLimitError(429, undefined, "slow down", new Headers()); });
  await assert.rejects(createClaudeClient(f.messages).json(req, signal), (e) => e instanceof AiError && e.status === 429);
});

test("withFallback uses the next provider when the first one fails", async () => {
  const down = { json: async () => { throw new AiError("down", 503); } };
  const up = { json: async () => ({ ok: true }) };
  setAiClient(withFallback([down, up]));
  assert.deepEqual(await generate(req, z.object({ ok: z.boolean() })), { ok: true });
  setAiClient(null);
});

test("withFallback does not retry a refusal on another provider", async () => {
  let second = false;
  const refuse = { json: async () => { throw new AiError("declined", 422); } };
  const other = { json: async () => { second = true; return {}; } };
  await assert.rejects(withFallback([refuse, other]).json(req, signal), (e) => e instanceof AiError && e.status === 422);
  assert.equal(second, false);
});

test("Groq adapter sends a JSON-schema request and maps errors", async () => {
  const { createGroqClient } = await import("../src/ai/client.js");
  const sent: { url: string; body: any; auth: string }[] = [];
  const ok = (async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(init.body as string), auth: (init.headers as Record<string, string>).authorization });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"a":{"b":"ok"}}' } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  assert.deepEqual(await createGroqClient("k", "m", ok).json(req, signal), { a: { b: "ok" } });
  assert.equal(sent[0].auth, "Bearer k");
  assert.equal(sent[0].body.model, "m");
  assert.equal(sent[0].body.response_format.type, "json_schema");
  assert.equal(sent[0].body.response_format.json_schema.schema.additionalProperties, false);
  const status = (code: number) => (async () => new Response("{}", { status: code })) as unknown as typeof fetch;
  for (const [code, want] of [[429, 429], [401, 503], [500, 503], [400, 502]] as const) {
    await assert.rejects(createGroqClient("k", "m", status(code)).json(req, signal), (e) => e instanceof AiError && e.status === want);
  }
});
