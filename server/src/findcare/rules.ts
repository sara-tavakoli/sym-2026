import { z } from "zod";
import { screenEmergency } from "../ai/assistant.js";

/**
 * "Find care that fits": a rule-based, NON-diagnostic suggestion of the kind of service people often start with.
 * Pure keyword matching over the person's own words. No AI, no triage, no urgency assessment. Every suggestion maps to
 * a Fit Finder category that exists in the directory (or none, for advice-only options like a pharmacist).
 */

export const DURATIONS = ["under_week", "weeks", "months", "over_3_months"] as const;
export const DURATION_LABELS: Record<(typeof DURATIONS)[number], string> = {
  under_week: "less than a week", weeks: "1 to 4 weeks", months: "1 to 3 months", over_3_months: "more than 3 months",
};
export const SEEN = ["no", "yes", "referral"] as const;
export const MODES = ["in_person", "telehealth", "either"] as const;

export const suggestBody = z.object({
  concern: z.string().trim().min(1, "Tell us a little about what's going on").max(1000, "Please keep it under 1,000 characters"),
  duration: z.enum(DURATIONS).optional(),
  seen: z.enum(SEEN).optional(),
  location: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().min(1).max(80).optional()),
  mode: z.enum(MODES).optional(),
  /** The person has read the emergency notice and wants to continue anyway. */
  acknowledged_emergency: z.boolean().optional(),
});
export type SuggestInput = z.infer<typeof suggestBody>;

export interface Pathway {
  id: string;
  label: string;
  /** Fit Finder category id, or null when the option isn't in the directory (advice only). */
  category: string | null;
  /** Patterns matched at a word start, case-insensitive. */
  keywords: string[];
  /** Plain-language, non-diagnostic sentence completing "You mentioned X →". */
  because: string;
}

// Ordered from most to least specific: on a tie the earlier pathway wins. GP is the default when nothing matches.
export const PATHWAYS: Pathway[] = [
  { id: "dentist", label: "Dentist", category: "dentist", because: "a dentist is the usual place to start for teeth, gum and jaw concerns.",
    keywords: ["tooth", "teeth", "toothache", "gums?", "jaw", "dental", "filling", "wisdom tooth", "braces", "mouth ulcer", "bleeding gums"] },
  { id: "optometrist", label: "Optometrist", category: "optometrist", because: "optometrists check eyesight and eye comfort; a GP can also help.",
    keywords: ["eyes?", "eyesight", "vision", "blurry", "blurred", "glasses", "contact lens", "squint", "dry eyes?", "itchy eyes?"] },
  { id: "skin", label: "GP for a skin check", category: "gp", because: "many GPs do skin checks and can refer you to a dermatologist if needed.",
    keywords: ["mole", "freckle", "skin check", "sun ?spot", "spot on my", "skin", "eczema", "itch\\w*"] },
  { id: "physio", label: "Physiotherapist", category: "physiotherapist", because: "physiotherapists often see this; a GP can also help.",
    keywords: ["ankle", "knee", "shoulder", "back ?(?:pain|ache)", "sore back", "lower back", "my back", "neck", "hip", "sprain\\w*", "strain\\w*", "joint", "muscle", "hamstring", "injur\\w*", "fall", "fell", "twisted", "stiff\\w*", "posture", "sports?"] },
  { id: "psychologist", label: "Psychologist", category: "psychologist", because: "psychologists support people with this; a GP can also set up a Mental Health Treatment Plan for Medicare rebates.",
    keywords: ["stress\\w*", "anxi\\w*", "low mood", "mood", "depress\\w*", "panic\\w*", "worr\\w*", "sleep\\w*", "insomnia", "grief", "griev\\w*", "overwhelm\\w*", "lonely", "burn ?out", "sad"] },
  { id: "gp", label: "GP (general practitioner)", category: "gp", because: "a GP is a common first stop: they can talk it through, arrange tests and refer you on if needed.",
    keywords: ["fever", "cough\\w*", "cold", "flu", "sore throat", "throat", "headaches?", "tired", "fatigue", "rash", "ear", "earache", "stomach", "vomit\\w*", "nause\\w*", "check-?up", "prescriptions?", "blood test", "referral", "certificate", "pain"] },
];
const BY_ID = new Map(PATHWAYS.map((p) => [p.id, p]));
const GP = BY_ID.get("gp")!;
const TELEHEALTH_GP = { id: "telehealth_gp", label: "Telehealth GP", category: "gp", because: "a telehealth GP can talk it through from home and arrange tests or an in-person visit if needed." };
// Advice-only option: pharmacists aren't in the Fit Finder directory, so this is a note, never a search link.
const PHARMACIST_WORDS = /\b(cold|flu|sore throat|hay ?fever|cold sore|cough\w*|repeat prescriptions?)\b/i;

const regexCache = new Map<string, RegExp>();
const re = (kw: string) => {
  let r = regexCache.get(kw);
  if (!r) { r = new RegExp(`\\b(${kw})\\b`, "i"); regexCache.set(kw, r); }
  return r;
};

/** Pathways whose keywords appear in the text, with the exact words that matched. Best match first. */
export function matchPathways(text: string): { pathway: Pathway; matched: string[] }[] {
  const out: { pathway: Pathway; matched: string[]; order: number }[] = [];
  PATHWAYS.forEach((p, order) => {
    const matched: string[] = [];
    for (const kw of p.keywords) {
      const m = re(kw).exec(text);
      if (m && !matched.some((x) => x.toLowerCase() === m[1].toLowerCase())) matched.push(m[1]);
    }
    if (matched.length) out.push({ pathway: p, matched, order });
  });
  // GP keywords are generic ("pain"), so a specific pathway beats GP even with fewer hits.
  return out
    .sort((a, b) => Number(a.pathway.id === "gp") - Number(b.pathway.id === "gp") || b.matched.length - a.matched.length || a.order - b.order)
    .map(({ pathway, matched }) => ({ pathway, matched }));
}

/** Live "Might suit" chips while the person types. */
export function mightSuit(text: string) {
  return matchPathways(text).slice(0, 3).map(({ pathway }) => ({ id: pathway.id, label: pathway.label, category: pathway.category }));
}

export interface Suggestion {
  id: string; label: string; category: string | null; mode: "in_person" | "telehealth" | null;
  headline: string; reason: string; notes: string[];
  alternatives: { id: string; label: string; category: string | null; reason: string }[];
}

/** "Physiotherapist" -> "a physiotherapist", "Optometrist" -> "an optometrist", "GP ..." stays "a GP ...". */
export const withArticle = (label: string) => {
  const noun = label.replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase());
  return `${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}`;
};

const quote = (words: string[]) => words.slice(0, 3).map((w) => `“${w.toLowerCase()}”`).join(", ");

export function suggest(input: SuggestInput, categories: string[]): Suggestion {
  const matches = matchPathways(input.concern).filter((m) => !m.pathway.category || categories.includes(m.pathway.category));
  const top = matches[0];
  let primary: Pick<Pathway, "id" | "label" | "category" | "because"> = top?.pathway ?? GP;
  const mode = input.mode === "telehealth" ? "telehealth" : input.mode === "in_person" ? "in_person" : null;
  if (primary.id === "gp" && mode === "telehealth") primary = TELEHEALTH_GP;

  const reason = top
    ? `You mentioned ${quote(top.matched)} → ${primary.because}`
    : `Nothing you wrote points to a particular service, and that's fine → ${primary.because}`;

  const notes: string[] = [];
  if (input.duration === "over_3_months") notes.push("It's been going on for more than 3 months. A GP can help coordinate longer-term care and referrals.");
  else if (input.duration) notes.push(`It's been going on for ${DURATION_LABELS[input.duration]}.`);
  if (input.seen === "referral") notes.push("You have a referral. Bring it with you; if it names a specific practitioner or specialist, book with them.");
  else if (input.seen === "yes") notes.push("You've seen someone about this before. Going back to the same practitioner, or a GP, can help with continuity.");
  else if (input.seen === "no") notes.push("You haven't seen anyone about this yet. Writing down when it started and what you've noticed helps at the first visit.");
  if (PHARMACIST_WORDS.test(input.concern) && primary.id !== "dentist") notes.push("For minor coughs, colds and hay fever, a pharmacist can also give advice without an appointment.");
  if (primary.id === "psychologist") notes.push("You don't need a referral to see a psychologist, but you need a GP's Mental Health Treatment Plan for Medicare rebates.");

  const alternatives: Suggestion["alternatives"] = [];
  for (const m of matches.slice(1, 3)) if (m.pathway.id !== primary.id && m.pathway.id !== "gp") alternatives.push({ id: m.pathway.id, label: m.pathway.label, category: m.pathway.category, reason: `You also mentioned ${quote(m.matched)}.` });
  if (primary.category !== "gp" || primary.id === "skin") alternatives.push({ id: "gp", label: GP.label, category: "gp", reason: "A GP can also help, and can refer you on." });
  else if (primary.id === "gp" && mode !== "telehealth") alternatives.push({ id: TELEHEALTH_GP.id, label: TELEHEALTH_GP.label, category: "gp", reason: "If getting there is hard, a GP can often talk it through by video or phone." });

  return {
    id: primary.id, label: primary.label, category: primary.category,
    mode: primary.id === TELEHEALTH_GP.id ? "telehealth" : mode,
    headline: `People with similar concerns often start with ${withArticle(primary.label)}`,
    reason, notes, alternatives,
  };
}

/** Red flags reuse the assistant's emergency screen (one regex, one wording). */
export function redFlag(text: string): { selfHarm: boolean; message: string } | null {
  const e = screenEmergency(text);
  return e ? { selfHarm: e.selfHarm, message: e.reply } : null;
}
