import { ApiError, GoogleGenAI } from "@google/genai";
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
// These are short structured tasks whose output is verified server-side, so deep reasoning isn't needed.
// LOW thinking measured noticeably faster and more consistent than the model default; "default" disables the override.
const THINKING_LEVEL = (process.env.GEMINI_THINKING_LEVEL || "low").toUpperCase();
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
            maxOutputTokens: 4096, // bounds runaway output; real responses are a few hundred tokens
            abortSignal: signal,
            ...(THINKING_LEVEL !== "DEFAULT" ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL } } : {}),
          },
        });
        text = res.text;
      } catch (e) {
        if (signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
        if (e instanceof ApiError || typeof (e as { status?: unknown }).status === "number") {
          const status = (e as { status: number }).status;
          if (status === 429) {
            // Distinguish an exhausted daily quota (won't clear in a minute) from short-term rate limiting.
            if (/PerDay/i.test(String((e as Error).message))) throw new AiError("The AI's daily usage limit has been reached. AI features will be available again later — everything else still works.", 429);
            throw new AiError("The AI service is busy right now. Please try again in a minute.", 429);
          }
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

// The SDK client is created lazily so the app (and every non-AI feature) starts without a key.
let defaultClient: AiClient | null = null;
function getDefaultClient(): AiClient {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiError("AI features are not configured on this server (missing GEMINI_API_KEY).", 503);
  defaultClient ??= createGeminiClient(new GoogleGenAI({ apiKey }).models);
  return defaultClient;
}

let override: AiClient | null = null;
export const setAiClient = (c: AiClient | null) => { override = c; };
export const aiInfo = () => ({ provider: "google-gemini", model: GEMINI_MODEL, configured: !!process.env.GEMINI_API_KEY || !!override });

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
