import { FIELDS, type Field, type PrepInput, type Section } from "./brief.js";

// Deterministic stand-ins for the two core AI calls, used when no AI provider is configured or the
// provider is temporarily unavailable. They only split the user's own text into sentences, so their
// output passes the same verification (verbatim quotes, medication and vague-wording flags) as AI output.

/** Splits text into trimmed sentences or lines, keeping each one verbatim. */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 1);
}

const tidy = (s: string) => {
  const t = s.replace(/\s+/g, " ").replace(/[.;,]+$/, "").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// Which section each field's sentences go to; the first sentence of the main concern becomes the reason.
const SECTION_OF: Record<Field, Section> = {
  main_concern: "timeline", onset: "timeline", experiences: "timeline", background: "background", questions: "questions", additional: "notes",
};

export function fallbackBrief(input: PrepInput) {
  const out: Record<Section, { text: string; field: Field; quote: string }[]> = { reason: [], timeline: [], background: [], questions: [], notes: [] };
  for (const field of FIELDS) {
    const parts = field === "questions"
      ? input.questions.split(/(?<=\?)\s*|\n+/).map((s) => s.trim()).filter((s) => s.length > 1)
      : sentences(input[field]);
    parts.forEach((quote, i) => {
      const section = field === "main_concern" && i === 0 ? "reason" : SECTION_OF[field];
      out[section].push({ text: field === "questions" ? quote : tidy(quote), field, quote });
    });
  }
  return out;
}

// Instructions are usually imperative sentences; keep those that start by asking the patient to do something.
const LEAD = /^(?:please,?\s+|you (?:should|need to|will need to|can)\s+|make sure (?:to|you)\s+|remember to\s+|try to\s+|if [^,]{1,80},\s*)*/i;
const ACTION = /^(book|make|schedule|arrange|get|have|take|use|apply|start|stop|continue|avoid|keep|drink|eat|rest|call|ring|phone|contact|see|visit|return|come back|go to|attend|bring|check|monitor|record|track|write|review|follow up|follow-up|collect|pick up|fill|do|try|walk|exercise|stretch|elevate|ice|wear|limit|reduce|increase|book in)\b/i;
const DEADLINE = /\b(today|tonight|tomorrow|this week|next week|within \d+\s*(?:days?|weeks?|months?)|in \d+\s*(?:days?|weeks?|months?)|in (?:a|one|two|three|four|six) (?:days?|weeks?|months?)|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?:st|nd|rd|th)? \w+)|for \d+\s*(?:days?|weeks?))\b/i;

// Clinician shorthand often names the item instead of a verb ("Blood test within 5 days", "Referral to physio").
const ITEM = /^(blood tests?|bloods|pathology|urine test|x-?rays?|scans?|ultrasound|mri|ct|ecg|referral|follow[- ]?up|review|appointment|vaccinations?|flu shot|physio(?:therapy)?|stitches|dressing)\b/i;

export function fallbackTasks(text: string) {
  return {
    tasks: sentences(text).filter((s) => { const t = s.replace(LEAD, ""); return ACTION.test(t) || ITEM.test(t); }).slice(0, 40).map((s) => ({
      title: tidy(s).slice(0, 200),
      source_text: s,
      deadline: s.match(DEADLINE)?.[0] ?? null,
      needs_clarification: false,
      clarification_reason: null,
    })),
  };
}
