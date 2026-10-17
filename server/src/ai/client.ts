import { ApiError, GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";

/**
 * AI access is behind a small interface so the provider can be swapped and tests can inject a
 * deterministic client. The default provider is Google Gemini via the official @google/genai SDK.
 * The API key is read on the server only and is never sent to the browser.
 */
export interface AiRequest { system: string; user: string; schema: object }
export interface AiClient { json(req: AiRequest, signal: AbortSignal): Promise<unknown> }

export class AiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 60_000);
const MAX_CONCURRENT = Number(process.env.AI_MAX_CONCURRENT ?? 4);
const MAX_QUEUE = Number(process.env.AI_MAX_QUEUE ?? 20);

/** The subset of the SDK we use; lets tests pass a fake without network access. */
export interface GeminiModels {
  generateContent(params: {
    model: string;
    contents: string;
    config: Record<string, unknown>;
  }): Promise<{ text?: string | undefined }>;
}

export function createGeminiClient(models: GeminiModels, model = GEMINI_MODEL): AiClient {
  return {
    async json({ system, user, schema }, signal) {
      let text: string | undefined;
      try {
        const res = await models.generateContent({
          model,
          contents: user,
          config: {
            systemInstruction: system,
            temperature: 0.1,
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            abortSignal: signal,
          },
        });
        text = res.text;
      } catch (e) {
        if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
        if (e instanceof ApiError || typeof (e as { status?: unknown }).status === "number") {
          const status = (e as { status: number }).status;
          if (status === 429) throw new AiError("The AI service is busy right now. Please try again in a minute.", 429);
          if (status === 401 || status === 403) throw new AiError("The AI service is not configured correctly.", 503);
          if (status === 404) throw new AiError("The configured AI model is not available.", 503);
          throw new AiError("The AI service returned an error.", 502);
        }
        throw new AiError("The AI service is not reachable. Please try again.", 503);
      }
      // Non-JSON output throws here and is retried once by generate().
      return JSON.parse(text ?? "");
    },
  };
}

/** Structured outputs require every object to declare additionalProperties: false. */
export function strictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out = Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, strictSchema(v)]));
  if (out.type === "object" && !("additionalProperties" in out)) out.additionalProperties = false;
  return out;
}

/** The subset of the Anthropic SDK we use; lets tests pass a fake without network access. */
export interface ClaudeMessages {
  create(params: Anthropic.Beta.MessageCreateParamsNonStreaming, options?: { signal?: AbortSignal }): PromiseLike<Anthropic.Beta.BetaMessage>;
}

export function createClaudeClient(messages: ClaudeMessages, model = CLAUDE_MODEL): AiClient {
  return {
    async json({ system, user, schema }, signal) {
      let res: Anthropic.Beta.BetaMessage;
      try {
        res = await messages.create({
          model, max_tokens: 16000, system,
          messages: [{ role: "user", content: user }],
          output_config: { effort: "low", format: { type: "json_schema", schema: strictSchema(schema) as Record<string, unknown> } },
          betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
        }, { signal });
      } catch (e) {
        if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
        if (e instanceof Anthropic.RateLimitError) throw new AiError("The AI service is busy right now. Please try again in a minute.", 429);
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AiError("The AI service is not configured correctly.", 503);
        if (e instanceof Anthropic.NotFoundError) throw new AiError("The configured AI model is not available.", 503);
        if (e instanceof Anthropic.APIConnectionError) throw new AiError("The AI service is not reachable. Please try again.", 503);
        if (e instanceof Anthropic.APIError) throw new AiError("The AI service returned an error.", 502);
        throw e;
      }
      if (res.stop_reason === "refusal") throw new AiError("The AI declined this request. Please rephrase and try again.", 422);
      const text = res.content.find((b) => b.type === "text");
      // Non-JSON output throws here and is retried once by generate().
      return JSON.parse(text?.type === "text" ? text.text : "");
    },
  };
}

/** Tries each provider in order; a provider-side failure (not a timeout) falls through to the next one. */
export function withFallback(clients: AiClient[]): AiClient {
  return {
    async json(req, signal) {
      let last: unknown;
      for (const c of clients) {
        try { return await c.json(req, signal); } catch (e) {
          if (!(e instanceof AiError) || e.status === 422) throw e;
          last = e;
        }
      }
      throw last;
    },
  };
}

// Providers are created lazily so the app (and every non-AI feature) starts without a key.
// AI_PROVIDER picks which one goes first when both keys are set; the other becomes the fallback.
const providers = () => {
  const list: { name: string; model: string; make: () => AiClient }[] = [];
  if (process.env.GEMINI_API_KEY) list.push({ name: "google-gemini", model: GEMINI_MODEL, make: () => createGeminiClient(new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }).models) });
  if (process.env.ANTHROPIC_API_KEY) list.push({ name: "anthropic-claude", model: CLAUDE_MODEL, make: () => createClaudeClient(new Anthropic().beta.messages) });
  return process.env.AI_PROVIDER === "claude" ? list.reverse() : list;
};

let defaultClient: AiClient | null = null;
function getDefaultClient(): AiClient {
  if (defaultClient) return defaultClient;
  const list = providers();
  if (!list.length) throw new AiError("AI features are not configured on this server (set GEMINI_API_KEY or ANTHROPIC_API_KEY).", 503);
  defaultClient = withFallback(list.map((p) => p.make()));
  return defaultClient;
}

let override: AiClient | null = null;
export const setAiClient = (c: AiClient | null) => { override = c; };
export const aiInfo = () => {
  const list = providers();
  return {
    provider: list[0]?.name ?? "google-gemini", model: list[0]?.model ?? GEMINI_MODEL,
    ...(list[1] ? { fallback: list[1].name } : {}), configured: list.length > 0 || !!override,
  };
};

// Bounded in-process queue: caps concurrent paid requests per instance and sheds load when saturated.
// Future path: replace with a durable job queue + workers (see docs/ARCHITECTURE.md).
let running = 0;
const waiting: (() => void)[] = [];
async function acquire() {
  if (running < MAX_CONCURRENT) { running++; return; }
  if (waiting.length >= MAX_QUEUE) throw new AiError("The AI service is busy. Please try again in a minute.", 503);
  await new Promise<void>((r) => waiting.push(r));
}
function release() {
  const next = waiting.shift();
  if (next) next(); else running--;
}

/** Calls the model, validates the result against a zod schema, and retries once if it is malformed. */
export async function generate<T>(req: AiRequest, validator: ZodType<T>): Promise<T> {
  const client = override ?? getDefaultClient();
  await acquire();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const out = await client.json(req, ctrl.signal);
        const parsed = validator.safeParse(out);
        if (parsed.success) return parsed.data;
      } catch (e) {
        if ((e as Error).name === "AbortError" || ctrl.signal.aborted) throw new AiError("The AI took too long to respond. Please try again.", 504);
        if (e instanceof AiError) throw e;
        // JSON.parse failure etc.: fall through and retry once
      } finally { clearTimeout(timer); }
    }
    throw new AiError("The AI returned an unusable result. Please try again.", 502);
  } finally { release(); }
}
