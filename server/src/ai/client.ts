import type { ZodType } from "zod";

/**
 * AI access is behind a small interface so the provider can be swapped (e.g. a hosted model later)
 * and tests can inject a deterministic client. The default provider is a LOCAL Ollama model:
 * no paid API, and health text never leaves the machine.
 */
export interface AiRequest { system: string; user: string; schema: object }
export interface AiClient { json(req: AiRequest, signal: AbortSignal): Promise<unknown> }

export class AiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:9b";
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 120_000);
const MAX_CONCURRENT = Number(process.env.AI_MAX_CONCURRENT ?? 1);
const MAX_QUEUE = Number(process.env.AI_MAX_QUEUE ?? 8);

const ollama: AiClient = {
  async json({ system, user, schema }, signal) {
    let res: Response;
    try {
      res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST", signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL, stream: false, think: false, format: schema,
          options: { temperature: 0.1 }, keep_alive: "30m",
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new AiError("The AI service is not reachable. Make sure Ollama is running.", 503);
    }
    if (!res.ok) throw new AiError("The AI service returned an error.", 502);
    const data = (await res.json()) as { message?: { content?: string } };
    return JSON.parse(data.message?.content ?? "");
  },
};

let client: AiClient = ollama;
export const setAiClient = (c: AiClient) => { client = c; };
export const aiInfo = () => ({ provider: "ollama (local)", model: OLLAMA_MODEL });

// Simple in-process queue: a small local model should not be hit by many parallel requests.
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
        if ((e as Error).name === "AbortError") throw new AiError("The AI took too long to respond. Please try again.", 504);
        if (e instanceof AiError) throw e;
        // JSON.parse failure etc.: fall through and retry once
      } finally { clearTimeout(timer); }
    }
    throw new AiError("The AI returned an unusable result. Please try again.", 502);
  } finally { release(); }
}
