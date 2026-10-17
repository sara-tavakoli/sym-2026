// Deterministic guards applied to model output. Prompts alone are not a safety boundary.

const INJECTION = /\b(ignore|disregard|forget|override)\b[^.!?\n]{0,40}\b(previous|prior|above|earlier|all|any|these)\b[^.!?\n]{0,30}\b(instructions?|rules?|prompts?)\b|\bsystem prompt\b|\byou are now\b|\bact as\b[^.!?\n]{0,20}\b(doctor|clinician|physician)\b/i;

/** Sentences of the user's text that look like attempts to instruct the AI. Output must never be drawn from them. */
export function injectionSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).filter((s) => INJECTION.test(s)).map((s) => s.toLowerCase().replace(/\s+/g, " ").trim());
}

export function overlapsInjection(snippet: string, injected: string[]): boolean {
  const n = snippet.toLowerCase().replace(/\s+/g, " ").trim();
  return injected.some((s) => s.includes(n) || n.includes(s));
}

// A deadline must be an explicit date or timeframe, not a vague back-reference like "before then".
const EXPLICIT_TIME = /\d|\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|weeks|month|months|day|days|fortnight|year|january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
export const isExplicitDeadline = (d: string) => EXPLICIT_TIME.test(d);
