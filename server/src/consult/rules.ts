// Deterministic consult drafting: used when no AI provider is configured (or the AI call fails).
// Everything it produces is copied from the transcript, so every instruction keeps its source sentence.
import { randomUUID } from "node:crypto";

export const KINDS = ["test", "medication", "appointment", "self_care", "safety"] as const;
export type Kind = (typeof KINDS)[number];
export const NOTE_KEYS = ["subjective", "objective", "assessment", "plan"] as const;
export type NoteKey = (typeof NOTE_KEYS)[number];
export type Notes = Record<NoteKey, string>;
export interface Instruction { id: string; text: string; quote: string | null; kind: Kind; approved: boolean }

export const LIMITS = { transcript: 20_000, note: 4_000, instruction: 500, instructions: 20, author: 120 } as const;

interface Line { speaker: string | null; clinician: boolean; text: string }

const CLINICIAN_LABEL = /^(dr\.?|doctor|gp|clinician|nurse|physio\w*|dentist|practitioner|psychologist|specialist)\b/i;
const SPEAKER = /^([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3})\s*:\s*(.+)$/;

/** Splits a transcript into speaker lines. Without recognisable clinician speakers, every line counts as the clinician's (e.g. pasted notes). */
export function parseTranscript(text: string, practitionerName = ""): Line[] {
  const prac = practitionerName.trim().toLowerCase();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l): Line => {
    const m = SPEAKER.exec(l);
    if (!m) return { speaker: null, clinician: false, text: l };
    const who = m[1];
    return { speaker: who, clinician: CLINICIAN_LABEL.test(who) || (!!prac && who.toLowerCase() === prac), text: m[2].trim() };
  });
  if (!lines.some((l) => l.clinician)) return lines.map((l) => ({ ...l, clinician: true }));
  // Unlabelled continuation lines belong to whoever spoke last.
  let last = false;
  return lines.map((l) => { if (l.speaker) last = l.clinician; else l.clinician = last; return l; });
}

export const sentences = (text: string) => text.split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/).map((s) => s.trim()).filter(Boolean);

const CUE = /\b(book|take|get|arrange|review|call|avoid|continue|return|start|stop|use|apply|try|keep|drink|rest|come back|bring|attend|schedule|limit|reduce|floss|brush)\b/i;
const FIRST_PERSON = /^(?:(?:so|and|ok|okay|now|also|then|right|great|alright)[,\s]+)*(i|i'm|i've|i'll|we|we'll|we're|let me|it|it's|that|this|there)\b/i;
const ASKS_PATIENT = /\b(i(?:'d| would) like you to|i want you to|i(?:'d)? suggest (?:that )?you|we(?:'ll| will) need you to|i need you to)\b/i;
const LEAD = /^(?:(?:so|and|ok|okay|now|also|then|right|great|alright|first|finally|next)[,\s]+|(?:i(?:'d| would) like you to|i want you to|i(?:'d)? suggest (?:that )?you|we(?:'ll| will) need you to|i need you to|you should|you can|you'll need to|you need to|you could|can you|could you|please|let's)\s+)+/i;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Turns "So I'd like you to please get a blood test." into "Get a blood test." */
export function toInstruction(sentence: string): string {
  const t = sentence.replace(LEAD, "").trim();
  return cap(t.endsWith(".") || t.endsWith("!") ? t.replace(/!$/, ".") : `${t}.`);
}

export function classify(text: string): Kind {
  const t = text.toLowerCase();
  if (/^if\b|\b000\b|emergency|straight away|same day|urgent/.test(t)) return "safety";
  if (/\b(blood test|test|tests|x-ray|scan|ultrasound|bloods|pathology|iron studies|swab|biopsy)\b/.test(t)) return "test";
  if (/\b(tablets?|medicines?|medications?|paracetamol|ibuprofen|supplements?|inhaler|cream|ointment|dose|prescri\w*|antibiotics?|\w+(?:pril|olol|statin|sartan|cillin|mycin|prazole))\b|\b\d+(?:\.\d+)?\s?(?:mg|mcg|ml|micrograms?)\b/.test(t)) return "medication";
  if (/\b(book|return|review|follow[- ]up|appointment|check-up)\b/.test(t)) return "appointment";
  return "self_care";
}

/** Action sentences said by the clinician, each kept with its exact source sentence. */
export function extractInstructions(transcript: string, practitionerName = ""): Instruction[] {
  const out: Instruction[] = [];
  const seen = new Set<string>();
  for (const line of parseTranscript(transcript, practitionerName)) {
    if (!line.clinician) continue;
    for (const s of sentences(line.text)) {
      if (s.endsWith("?") || !CUE.test(s)) continue;
      if (FIRST_PERSON.test(s) && !ASKS_PATIENT.test(s) && !/^if\b/i.test(s)) continue;
      const text = toInstruction(s).slice(0, LIMITS.instruction);
      if (text.length < 8 || seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      out.push({ id: randomUUID(), text, quote: s, kind: classify(text), approved: false });
      if (out.length >= LIMITS.instructions) return out;
    }
  }
  return out;
}

const EXAM = /\b(blood pressure|temperature|pulse|heart rate|saturation|examination|exam|look(?:s)? normal|sound(?:s)? (?:normal|clear)|\d+ over \d+|inflamed|cavity|tender|swollen|swelling on|weight|bmi)\b/i;
const IMPRESSION = /\b(could be|common|commonly|likely|probably|suggests?|explain|reassuring|fixable|reasonable|part of it|cause|good news)\b/i;
const SMALL_TALK = /^(thanks?|thank you|great|ok(?:ay)?|sure|will do|got it|yes|no)\b[^.]*[.!]?$/i;
const NONE = "Nothing found in the transcript. Add if relevant.";

/** Sorts transcript sentences into SOAP headings. Copies sentences; never paraphrases or adds findings. */
export function draftNotes(transcript: string, instructions: Instruction[], practitionerName = ""): Notes {
  const lines = parseTranscript(transcript, practitionerName);
  const hasPatient = lines.some((l) => !l.clinician);
  const quotes = new Set(instructions.map((i) => i.quote));
  const patient: string[] = [], exam: string[] = [], impression: string[] = [];
  for (const l of lines) {
    for (const s of sentences(l.text)) {
      if (quotes.has(s) || SMALL_TALK.test(s) || (/thank/i.test(s) && s.length < 50)) continue;
      if (!l.clinician) { patient.push(s); continue; }
      if (s.endsWith("?")) continue;
      if (EXAM.test(s)) exam.push(s);
      else if (IMPRESSION.test(s)) impression.push(s);
    }
  }
  return {
    subjective: patient.length ? `Patient reports: ${patient.slice(0, 8).join(" ")}` : hasPatient ? NONE : "No patient speech found (pasted notes). Add the history if relevant.",
    objective: exam.length ? exam.slice(0, 8).join(" ") : NONE,
    assessment: impression.length ? impression.slice(0, 6).join(" ") : "To be completed by the clinician.",
    plan: instructions.length ? instructions.map((i) => `- ${i.text}`).join("\n") : NONE,
  };
}

const GROUPS: { kind: Kind; title: string }[] = [
  { kind: "test", title: "Tests to arrange" },
  { kind: "appointment", title: "Appointments to book" },
  { kind: "medication", title: "Medicines" },
  { kind: "self_care", title: "Looking after yourself" },
  { kind: "safety", title: "When to get help quickly" },
];

/** Plain-language summary built only from the approved instructions: nothing new is added. */
export function rulesSummary(author: string, instructions: Pick<Instruction, "text" | "kind">[]): string {
  const n = instructions.length;
  const parts = [`${author} reviewed your visit and approved ${n} next step${n === 1 ? "" : "s"} for you. Here they are, grouped by type.`];
  for (const g of GROUPS) {
    const items = instructions.filter((i) => i.kind === g.kind);
    if (!items.length) continue;
    const lines = items.map((i) => `• ${i.text}`);
    parts.push(`${g.title}\n${lines.join("\n")}`);
  }
  parts.push("If anything here is unclear, contact your clinic.");
  return parts.join("\n\n");
}
