// Deterministic follow-up task categories (ported from the VisitReady prototype's keyword rules, no AI).
// The wording of a task is never changed here: classification only adds a label and, for daily tasks, a duration.

export const CATEGORIES = ["urgent", "daily", "follow_up", "one_time"] as const;
export type Category = (typeof CATEGORIES)[number];
export const DEFAULT_DAILY_DAYS = 7;
export const MAX_DAILY_DAYS = 90;

const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30,
};
const NUM = `(\\d{1,3}|${Object.keys(WORDS).join("|")})`;
const UNIT: Record<string, number> = { day: 1, week: 7, fortnight: 14, month: 30 };
const DURATION = new RegExp(`\\bfor (?:the next |another |at least )?${NUM} (day|week|fortnight|month)s?\\b`);
const FORTNIGHT = /\bfor (?:a|one|the next) fortnight\b/;

const URGENT = [
  /^if\b/, /\bif (it|this|they|symptoms?|the \w+|you|your \w+) (gets?|becomes?|are|is|feel|get) (worse|severe|bad)/, /\bgets? worse\b/, /\bif worse\b/,
  /\bworsens?\b/, /\bimmediately\b/, /\burgent(ly)?\b/, /\b000\b/, /\bemergency\b/, /\bstraight away\b/, /\bright away\b/,
  /\bgo to (the )?(ed|hospital|emergency)\b/, /\bseek (urgent|immediate) (help|care|medical)/,
];
const FOLLOW_UP = [
  /\bbook\b/, /\breview\b/, /\bfollow[- ]?up\b/, /\breferral\b/, /\brefer(red)?\b/, /\bblood tests?\b/, /\btests?\b/, /\bscans?\b/,
  /\bx-?rays?\b/, /\bultrasound\b/, /\bresults\b/, /\bappointment\b/, /\bsee (a|the|your) \w+/, /\bnext week\b/, /\bpathology\b/,
];
const DAILY = [
  /\bdaily\b/, /\bevery (day|morning|night|evening|afternoon)\b/, /\beach (day|morning|night|evening)\b/, /\bnightly\b/,
  /\b(once|twice|three times|\d+ times) (a|per|each) day\b/, /\bper day\b/, /\bat bedtime\b/, /\bbefore bed\b/,
  /\bwith (each|every) meal\b/,
  // Ongoing self-care habits with no stated frequency.
  /^(please )?(keep|continue|drink|avoid|rest|stretch|stand up slowly|elevate)\b/,
];

const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : WORDS[s] ?? 1);

/** "for 7 days" -> 7, "for two weeks" -> 14, "for a fortnight" -> 14; null when no duration is written. */
export function parseDuration(text: string): number | null {
  const t = text.toLowerCase();
  if (FORTNIGHT.test(t)) return 14;
  const m = DURATION.exec(t);
  if (!m) return null;
  return Math.max(1, Math.min(MAX_DAILY_DAYS, num(m[1]) * UNIT[m[2]]));
}

/** Rule order matters: safety-net wording wins, then appointments/tests to arrange, then repeated actions. */
export function classifyTask(...texts: (string | null | undefined)[]): { category: Category; duration_days: number | null } {
  const t = texts.filter(Boolean).join(" \n ").toLowerCase().replace(/\s+/g, " ").trim();
  const any = (rules: RegExp[]) => rules.some((r) => r.test(t));
  const duration = parseDuration(t);
  let category: Category;
  if (any(URGENT)) category = "urgent";
  else if (any(FOLLOW_UP)) category = "follow_up";
  else if (duration !== null || any(DAILY)) category = "daily";
  else category = "one_time";
  return { category, duration_days: category === "daily" ? duration ?? DEFAULT_DAILY_DAYS : null };
}
