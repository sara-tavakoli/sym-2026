// Deterministic parser for booking confirmations (email / SMS text) and calendar files (.ics VEVENT).
// No AI, no network: every value comes with the exact snippet of the pasted text it was read from,
// so the patient can check it before anything is saved. Nothing here is saved automatically.
import { injectionSentences } from "../ai/safety.js";
import {
  DEFAULT_TZ, MONTH_RE, WEEKDAY_RE, isValidTimeZone, monthNum, offsetMinutes, validDate, weekday, weekdayNum, zonedDate, zonedToUtc,
} from "./tz.js";

export const FIELD_KEYS = ["starts_at", "practitioner_name", "service_type", "clinic_name", "location", "purpose"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
/** Fields the appointment form requires. AI assist is only considered when one of these is missing. */
export const REQUIRED_FIELDS: FieldKey[] = ["starts_at", "practitioner_name", "service_type", "clinic_name"];

export type Confidence = "high" | "medium" | "low" | "not_found";
export interface ParsedField {
  value: string | null;
  /** Exact text from the confirmation the value was read from (null when not found). */
  source: string | null;
  confidence: Confidence;
  via: "parser" | "ai" | null;
  note?: string;
}
export interface ParseResult {
  format: "ics" | "text";
  timezone: string;
  fields: Record<FieldKey, ParsedField>;
  warnings: string[];
  ai_used: boolean;
}

const MAX_SNIPPET = 240;
const notFound = (): ParsedField => ({ value: null, source: null, confidence: "not_found", via: null });
const found = (value: string, source: string, confidence: Exclude<Confidence, "not_found">, note?: string): ParsedField =>
  ({ value: value.slice(0, 500), source: source.trim().slice(0, MAX_SNIPPET), confidence, via: "parser", ...(note ? { note } : {}) });
const tidy = (s: string) => s.replace(/\s*\n\s*/g, ", ").replace(/[ \t]+/g, " ").replace(/,\s*,/g, ",").replace(/^[\s,:;\-–—]+|[\s,;:\-–—]+$/g, "").trim();

/** Lines that read like instructions to an AI are blanked out (keeping line numbers) so no value is ever drawn from them. */
function withoutInjection(text: string): { text: string; removed: number } {
  let removed = 0;
  const lines = text.split("\n").map((l) => {
    if (injectionSentences(l).length) { removed++; return ""; }
    return l;
  });
  return { text: lines.join("\n"), removed };
}

// ---------------------------------------------------------------- labelled values ("Label: value")

// A value ends at the end of the line, a ';' or '|', or a sentence-ending full stop (not the dot in "Dr." / "St.").
const VALUE_END = String.raw`(?=$|(?<!\b(?:Dr|Prof|St|Rd|Ave|Mr|Mrs|Ms|Assoc|No|Lvl|Pde|Hwy|Mt))\.(?:\s|$)|;|\|)`;
const LABELS = {
  practitioner: "practitioner|doctor|gp|provider|clinician|seeing|appointment with|with",
  clinic: "clinic|practice|medical cent(?:re|er)|venue|clinic name|practice name",
  location: "address|location|where",
  service: "appointment type|type of appointment|consultation type|consult type|booking type|visit type|service|appointment",
  purpose: "reason for (?:visit|appointment|booking)|reason|purpose|visit reason",
  date: "date and time|date & time|date/time|appointment date|date|when|time",
};

function labelled(text: string, labels: string): { value: string; snippet: string } | null {
  const re = new RegExp(String.raw`(^|[^A-Za-z])((?:${labels})\s*(?::|\s[–—-])[ \t]*([^\n]+?)[ \t]*)${VALUE_END}`, "gim");
  for (const m of text.matchAll(re)) {
    const value = tidy(m[3]);
    if (value) return { value, snippet: m[2].trim() };
  }
  return null;
}

// ---------------------------------------------------------------- dates and times

interface DateHit { y: number | null; m: number; d: number; wd: number | null; index: number; end: number; text: string; h?: number; min?: number }
interface TimeHit { h: number; min: number; index: number; end: number; text: string }

const DATE_PATTERNS: { re: RegExp; get: (m: RegExpMatchArray) => Omit<DateHit, "index" | "end" | "text"> | null }[] = [
  { // Monday, 20 October 2026 · 20th Oct · Tue 21 Oct
    re: new RegExp(String.raw`(?:\b${WEEKDAY_RE}\.?,?\s+)?\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+${MONTH_RE}\b\.?(?:,?\s+(\d{4})\b)?`, "gi"),
    get: (m) => ({ wd: m[1] ? weekdayNum(m[1]) : null, d: +m[2], m: monthNum(m[3]), y: m[4] ? +m[4] : null }),
  },
  { // October 20, 2026 · Tuesday, Oct 20
    re: new RegExp(String.raw`(?:\b${WEEKDAY_RE}\.?,?\s+)?\b${MONTH_RE}\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4})\b)?`, "gi"),
    get: (m) => ({ wd: m[1] ? weekdayNum(m[1]) : null, m: monthNum(m[2]), d: +m[3], y: m[4] ? +m[4] : null }),
  },
  { // 20/10/2026 · 20-10-26 (Australian day-first order)
    re: new RegExp(String.raw`(?:\b${WEEKDAY_RE}\.?,?\s+)?(?<![\d/])\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})\b(?![/\d])`, "gi"),
    get: (m) => ({ wd: m[1] ? weekdayNum(m[1]) : null, d: +m[2], m: +m[3], y: m[4].length === 2 ? 2000 + +m[4] : +m[4] }),
  },
  { // 2026-10-20 or 2026-10-20T10:15
    re: /\b(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?\b/g,
    get: (m) => ({ wd: null, y: +m[1], m: +m[2], d: +m[3], ...(m[4] ? { h: +m[4], min: +m[5] } : {}) }),
  },
];

const TIME_12 = /(?<![\d:.])(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)(?![a-z])/gi;
const TIME_24 = /(?<![\d:.\/])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])(?!\s?(?:am|pm|a\.m|p\.m))/gi;

function timeFrom(m: RegExpMatchArray, twelve: boolean): TimeHit | null {
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (min > 59) return null;
  if (twelve) {
    if (h < 1 || h > 12) return null;
    const pm = m[3].toLowerCase().startsWith("p");
    h = (h % 12) + (pm ? 12 : 0);
  }
  return { h, min, index: m.index!, end: m.index! + m[0].length, text: m[0] };
}

function allTimes(text: string): TimeHit[] {
  const out: TimeHit[] = [];
  for (const m of text.matchAll(TIME_12)) { const t = timeFrom(m, true); if (t) out.push(t); }
  for (const m of text.matchAll(TIME_24)) { const t = timeFrom(m, false); if (t && !out.some((o) => t.index < o.end && o.index < t.end)) out.push(t); }
  return out.sort((a, b) => a.index - b.index);
}

function allDates(text: string): DateHit[] {
  const out: DateHit[] = [];
  for (const p of DATE_PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const v = p.get(m);
      if (!v || !v.m || !validDate(v.y ?? 2028, v.m, v.d)) continue; // 2028 is a leap year, so 29 Feb is allowed without a year
      const hit: DateHit = { ...v, index: m.index!, end: m.index! + m[0].length, text: m[0] };
      if (!out.some((o) => hit.index < o.end && o.index < hit.end)) out.push(hit);
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

const lineAt = (text: string, i: number) => text.slice(text.lastIndexOf("\n", i - 1) + 1, (text.indexOf("\n", i) + 1 || text.length + 1) - 1);

export interface FoundDateTime { iso: string | null; snippet: string; confidence: Exclude<Confidence, "not_found">; note?: string; date: string }

/** Finds the most likely appointment date/time in free text and converts it from `tz` wall-clock time to UTC. */
export function findDateTime(text: string, now: Date = new Date(), tz = DEFAULT_TZ): FoundDateTime | null {
  const dates = allDates(text);
  if (!dates.length) return null;
  const times = allTimes(text);
  const dateLabel = new RegExp(String.raw`\b(?:${LABELS.date}|appointment|booked|booking|on)\b`, "i");
  const header = /\b(sent|received|booked on|made on|issued|created|printed)\b/i;

  // Score each date: label lines win, a time right next to it wins, e-mail header dates lose.
  const scored = dates.map((d) => {
    const adjacent = times.find((t) => t.index >= d.end && t.index - d.end <= 12 && /^[\s,]*(?:at|@|from|-|–|—)?[\s,]*$/i.test(text.slice(d.end, t.index)))
      ?? times.find((t) => t.end <= d.index && d.index - t.end <= 8 && /^[\s,]*(?:on|-|–)?[\s,]*$/i.test(text.slice(t.end, d.index)));
    const line = lineAt(text, d.index);
    let score = 0;
    if (adjacent || d.h !== undefined) score += 3;
    if (dateLabel.test(line)) score += 2;
    if (header.test(line)) score -= 4;
    return { d, adjacent, score };
  });
  scored.sort((a, b) => b.score - a.score || a.d.index - b.d.index);
  const { d, adjacent } = scored[0];

  // Resolve a missing year: the occurrence closest to now (from 30 days ago onwards), matching the weekday if one was given.
  const today = zonedDate(now, tz);
  const [ty] = today.split("-").map(Number);
  let y = d.y;
  let yearNote: string | undefined;
  let confidence: FoundDateTime["confidence"] = "high";
  if (y === null) {
    const cands = [ty, ty + 1, ty - 1].filter((c) => validDate(c, d.m, d.d));
    const recentEnough = (c: number) => `${c}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` >= shift(today, -30);
    const byWeekday = d.wd !== null ? cands.find((c) => weekday(c, d.m, d.d) === d.wd && recentEnough(c)) : undefined;
    y = byWeekday ?? cands.find(recentEnough) ?? ty;
    if (byWeekday === undefined) { confidence = "medium"; yearNote = `No year was given; assumed ${y}.`; }
  } else if (d.wd !== null && weekday(y, d.m, d.d) !== d.wd) {
    confidence = "medium";
    yearNote = "The weekday doesn't match the date. Please check it.";
  }

  let time: { h: number; min: number } | null = d.h !== undefined ? { h: d.h, min: d.min! } : adjacent ?? null;
  let snippet = adjacent
    ? text.slice(Math.min(d.index, adjacent.index), Math.max(d.end, adjacent.end))
    : d.text;
  if (!time) {
    // A time given on its own line ("Time: 10:15 AM"), or the only time in the message.
    const labelledTime = times.find((t) => /\b(time|at|from|arrive)\b/i.test(lineAt(text, t.index)));
    const t = labelledTime ?? (times.length === 1 ? times[0] : undefined);
    if (t) {
      time = t;
      snippet = `${d.text} … ${lineAt(text, t.index).trim()}`;
      if (confidence === "high" && !labelledTime) confidence = "medium";
    }
  }
  const date = `${y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  if (!time) return { iso: null, snippet: snippet.trim(), confidence: "low", note: "Found a date but no time. Please enter the time.", date };
  return { iso: zonedToUtc(y, d.m, d.d, time.h, time.min, tz).toISOString(), snippet: snippet.trim(), confidence, date, ...(yearNote ? { note: yearNote } : {}) };
}

function shift(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- people, places, services

const NAME_WORD = String.raw`[A-Z][A-Za-z'’\-]+`;
const STOP_NAME = /^(at|on|in|from|for|with|the|and|medical|clinic|centre|center|practice|health|surgery|family|appointment|is|has|will|via)$/i;
const PRACTITIONER_RE = new RegExp(String.raw`\b(?:Dr|Doctor|Prof|Professor|A\/Prof|Assoc\.? Prof)\.?[ \t]+(${NAME_WORD}(?:[ \t]+${NAME_WORD}){0,3})`, "g");

export function findPractitioner(text: string): { value: string; snippet: string; confidence: "high" | "medium" } | null {
  const lab = labelled(text, LABELS.practitioner);
  if (lab && /[A-Za-z]{2}/.test(lab.value) && lab.value.length <= 120 && !/\d{2}/.test(lab.value)) {
    return { value: lab.value.replace(/\s*\((?:fictional|sample)\)\s*$/i, ""), snippet: lab.snippet, confidence: "high" };
  }
  for (const m of text.matchAll(PRACTITIONER_RE)) {
    const before = text.slice(Math.max(0, m.index! - 30), m.index!);
    if (/[A-Z][a-z]+[ \t]+$/.test(before) && !/\b(with|see|seeing|by|Hi|Dear|Hello)[ \t]+$/i.test(before)) continue; // "Demo Dr" (a street), not a person
    const line = lineAt(text, m.index!);
    if (/\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s+\d{4}\b/.test(line) && /\d+[A-Za-z]?\s+\w+\s+Dr\b/.test(line)) continue;
    const words = m[1].split(/[ \t]+/);
    while (words.length && STOP_NAME.test(words[words.length - 1])) words.pop();
    if (!words.length || STOP_NAME.test(words[0])) continue;
    const prefix = m[0].slice(0, m[0].indexOf(m[1])).trim();
    const value = `${prefix} ${words.join(" ")}`;
    return { value, snippet: value, confidence: "medium" };
  }
  return null;
}

const CLINIC_SUFFIX = "Medical Centre|Medical Center|Medical Clinic|Medical Practice|Medical Group|Family Practice|General Practice|Health Clinic|Health Centre|Health Center|Health Hub|Healthcare|Family Medicine|Clinic|Surgery|Practice|Medical|Physiotherapy|Physio|Dental|Health";
const CLINIC_RE = new RegExp(String.raw`(?:[A-Z][A-Za-z'’&\-]*|&)(?:[ \t]+(?:[A-Z][A-Za-z'’&\-]*|&|of|and|the|on)){0,5}[ \t]+(?:${CLINIC_SUFFIX})\b`, "g");
const CLINIC_BAD_START = /^(Your|You|Hi|Dear|Hello|The|This|Our|Please|Need|Thanks|Thank|Appointment|Confirmed|Booking|Reminder|Appt|Dr|Doctor|Prof)\b[ \t]*/;

export function findClinic(text: string): { value: string; snippet: string; confidence: "high" | "medium" } | null {
  const lab = labelled(text, LABELS.clinic);
  if (lab && lab.value.length <= 120 && !/^\d/.test(lab.value)) return { value: lab.value.split(/,\s*(?=(?:Level|Suite|Shop|Unit)?\s*\d)/)[0].trim(), snippet: lab.snippet, confidence: "high" };
  for (const m of text.matchAll(CLINIC_RE)) {
    let value = m[0];
    while (CLINIC_BAD_START.test(value)) value = value.replace(CLINIC_BAD_START, "");
    if (!value || new RegExp(String.raw`^(?:${CLINIC_SUFFIX})$`).test(value)) continue;
    if (/\b(Dr|Doctor)\b/.test(value)) continue;
    return { value, snippet: value, confidence: "medium" };
  }
  return null;
}

const STATES = "NSW|VIC|QLD|SA|WA|TAS|ACT|NT";
const STREET = "Street|St|Road|Rd|Avenue|Ave|Parade|Pde|Lane|Ln|Drive|Dr|Highway|Hwy|Place|Pl|Boulevard|Blvd|Way|Crescent|Cres|Court|Ct|Terrace|Tce|Circuit|Cct|Close|Cl|Square|Sq|Mall|Esplanade|Esp|Grove|Gr|Row";
const ADDRESS_RE = new RegExp(
  String.raw`(?:(?:Level|Lvl|Suite|Shop|Unit)[ \t]+\d+[A-Za-z]?,?[ \t]+)?\d+[A-Za-z]?(?:[\/\-]\d+[A-Za-z]?)?[ \t]+[A-Z][A-Za-z'’\-]*(?:[ \t]+[A-Z][A-Za-z'’\-]*){0,3}[ \t]+(?:${STREET})\.?(?:,[ \t]*\n?[ \t]*|[ \t]*\n[ \t]*|,?[ \t]+)[A-Z][A-Za-z'’\-]*(?:[ \t]+[A-Z][A-Za-z'’\-]*){0,3},?[ \t]+(?:${STATES})[ \t]+\d{4}\b`,
  "g");

export function findLocation(text: string): { value: string; snippet: string; confidence: "high" | "medium" } | null {
  const m = ADDRESS_RE.exec(text);
  ADDRESS_RE.lastIndex = 0;
  if (m) return { value: tidy(m[0]), snippet: m[0], confidence: "high" };
  const lab = labelled(text, LABELS.location);
  if (lab && (/\d/.test(lab.value) || new RegExp(String.raw`\b(?:${STATES})\b`).test(lab.value))) return { value: lab.value, snippet: lab.snippet, confidence: "medium" };
  // Fallback: a "Suburb NSW 2000" line, joined with a street line just above it.
  const lines = text.split("\n");
  const st = new RegExp(String.raw`\b(?:${STATES})\s+\d{4}\b`);
  for (let i = 0; i < lines.length; i++) {
    if (!st.test(lines[i])) continue;
    let snippet = lines[i].trim();
    if (i > 0 && /^\s*(?:\d|Level|Lvl|Suite|Shop|Unit)/i.test(lines[i - 1])) snippet = `${lines[i - 1].trim()}\n${snippet}`;
    const value = tidy(snippet.replace(/^[A-Za-z ]{2,20}:\s*/, ""));
    if (value.length <= 200) return { value, snippet, confidence: "medium" };
  }
  return null;
}

const SERVICE_KEYWORDS = /\b(standard consult(?:ation)?|long consult(?:ation)?|extended consult(?:ation)?|brief consult(?:ation)?|short consult(?:ation)?|telehealth (?:consult(?:ation)?|appointment|video|phone)|phone consult(?:ation)?|video consult(?:ation)?|new patient (?:consult(?:ation)?|appointment)|general consult(?:ation)?|gp (?:consult(?:ation)?|appointment)|skin check|flu (?:vaccine|vaccination|shot)|vaccination|health assessment|mental health (?:care )?plan|care plan|physiotherapy|physio (?:session|appointment|consult(?:ation)?)|dental (?:check-?up|appointment|clean)|eye test|blood test|pathology collection)\b/i;

/** Maps a booking's own wording to one of the form's service categories; unmapped wording is kept as written. */
export function normaliseService(raw: string): string {
  const s = raw.toLowerCase();
  if (/physio/.test(s)) return "Physiotherapy";
  if (/dent/.test(s)) return "Dentist";
  if (/psycholog|counsel/.test(s)) return "Psychology / Counselling";
  if (/optom|eye test/.test(s)) return "Optometry";
  if (/dermatolog/.test(s)) return "Dermatology";
  if (/patholog|blood test|x-?ray|ultrasound|imaging|radiolog/.test(s)) return "Pathology / Imaging";
  if (/specialist/.test(s)) return "Specialist";
  if (/\bgp\b|general practi|consult|telehealth|skin check|vaccin|\bflu\b|health assessment|care plan|check-?up/.test(s)) return "General Practitioner (GP)";
  return tidy(raw).slice(0, 80);
}

export function findService(text: string): { value: string; snippet: string; confidence: "high" | "medium" } | null {
  const lab = labelled(text, LABELS.service);
  if (lab && lab.value.length <= 80 && !allDates(lab.value).length && !allTimes(lab.value).length && !/\b(confirmed|reminder|with|at)\b/i.test(lab.value)) {
    return { value: normaliseService(lab.value), snippet: lab.snippet, confidence: "high" };
  }
  const k = SERVICE_KEYWORDS.exec(text);
  if (k) return { value: normaliseService(k[0]), snippet: k[0], confidence: "medium" };
  return null;
}

export function findPurpose(text: string): { value: string; snippet: string } | null {
  const lab = labelled(text, LABELS.purpose);
  return lab && lab.value.length <= 300 ? lab : null;
}

// ---------------------------------------------------------------- .ics

interface IcsProp { params: Record<string, string>; value: string; raw: string }

/** Unfolds RFC 5545 continuation lines (CRLF/LF followed by a space or tab). */
export const unfoldIcs = (text: string) => text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");
const unescapeIcs = (v: string) => v.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));

function parseVevent(text: string): Map<string, IcsProp> | null {
  const unfolded = unfoldIcs(text);
  const block = /BEGIN:VEVENT\n([\s\S]*?)(?:\nEND:VEVENT|$)/i.exec(unfolded);
  if (!block) return null;
  const props = new Map<string, IcsProp>();
  for (const line of block[1].split("\n")) {
    const m = /^([A-Za-z0-9-]+)((?:;[^:;]+=(?:"[^"]*"|[^:;]*))*):(.*)$/.exec(line.trim());
    if (!m) continue;
    const name = m[1].toUpperCase();
    if (props.has(name)) continue;
    const params: Record<string, string> = {};
    for (const p of m[2].split(";").filter(Boolean)) {
      const [k, ...rest] = p.split("=");
      params[k.toUpperCase()] = rest.join("=").replace(/^"|"$/g, "");
    }
    props.set(name, { params, value: m[3], raw: line.trim() });
  }
  return props;
}

const WINDOWS_TZ: [RegExp, string][] = [
  [/AUS Eastern/i, "Australia/Sydney"], [/E\. Australia/i, "Australia/Brisbane"], [/Cen\. Australia/i, "Australia/Adelaide"],
  [/AUS Central/i, "Australia/Darwin"], [/W\. Australia/i, "Australia/Perth"], [/Tasmania/i, "Australia/Hobart"],
];

function resolveTzid(tzid: string | undefined): { tz: string; note?: string } {
  if (!tzid) return { tz: DEFAULT_TZ, note: "No time zone in the file; assumed Sydney time." };
  if (isValidTimeZone(tzid)) return { tz: tzid };
  for (const [re, tz] of WINDOWS_TZ) if (re.test(tzid)) return { tz };
  const tail = tzid.split("/").slice(-2).join("/");
  if (isValidTimeZone(tail)) return { tz: tail };
  return { tz: DEFAULT_TZ, note: `Unknown time zone "${tzid.slice(0, 40)}"; assumed Sydney time.` };
}

function parseIcs(props: Map<string, IcsProp>, now: Date, result: ParseResult) {
  const f = result.fields;
  const dt = props.get("DTSTART");
  if (dt) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(dt.value.trim());
    if (m && validDate(+m[1], +m[2], +m[3])) {
      if (m[4] === undefined) {
        f.starts_at = { value: null, source: dt.raw, confidence: "not_found", via: null, note: "The calendar entry is all-day, so it has no time. Please enter the time." };
      } else if (m[7]) {
        f.starts_at = found(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))).toISOString(), dt.raw, "high");
      } else {
        const { tz, note } = resolveTzid(dt.params.TZID);
        result.timezone = tz;
        f.starts_at = found(zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], tz, +(m[6] ?? 0)).toISOString(), dt.raw, note ? "medium" : "high", note);
      }
    }
  }
  const summary = props.get("SUMMARY"), location = props.get("LOCATION"), description = props.get("DESCRIPTION");
  const loc = location ? unescapeIcs(location.value).trim() : "";
  if (loc) {
    const parts = loc.split(/\s*(?:,|\n)\s*/).filter(Boolean);
    const first = parts[0] ?? "";
    const firstIsName = parts.length > 1 && !/^(?:\d|Level|Lvl|Suite|Shop|Unit)/i.test(first) && !new RegExp(String.raw`\b(?:${STATES})\s+\d{4}\b`).test(first);
    if (firstIsName) {
      f.clinic_name = found(first, location!.raw, "high");
      f.location = found(tidy(parts.slice(1).join(", ")), location!.raw, "high");
    } else {
      f.location = found(tidy(loc), location!.raw, "high");
    }
  }
  // SUMMARY and DESCRIPTION are free text: reuse the e-mail heuristics on them.
  const free = [summary ? unescapeIcs(summary.value) : "", description ? unescapeIcs(description.value) : ""].join("\n");
  fillFromText(withoutInjection(free).text, now, result, { skipDate: !!f.starts_at.value || f.starts_at.source !== null });
}

// ---------------------------------------------------------------- main

function fillFromText(text: string, now: Date, result: ParseResult, opts: { skipDate?: boolean } = {}) {
  const f = result.fields;
  if (!opts.skipDate && !f.starts_at.value) {
    const dt = findDateTime(text, now, result.timezone);
    if (dt) f.starts_at = dt.iso ? found(dt.iso, dt.snippet, dt.confidence, dt.note) : { value: null, source: dt.snippet.slice(0, MAX_SNIPPET), confidence: "not_found", via: null, note: dt.note };
  }
  if (!f.practitioner_name.value) { const p = findPractitioner(text); if (p) f.practitioner_name = found(p.value, p.snippet, p.confidence); }
  if (!f.clinic_name.value) { const c = findClinic(text); if (c) f.clinic_name = found(c.value, c.snippet, c.confidence); }
  if (!f.location.value) { const l = findLocation(text); if (l) f.location = found(l.value, l.snippet, l.confidence); }
  if (!f.service_type.value) { const s = findService(text); if (s) f.service_type = found(s.value, s.snippet, s.confidence); }
  if (!f.purpose.value) { const p = findPurpose(text); if (p) f.purpose = found(p.value, p.snippet, "high"); }
}

export function emptyResult(format: ParseResult["format"] = "text"): ParseResult {
  return { format, timezone: DEFAULT_TZ, fields: Object.fromEntries(FIELD_KEYS.map((k) => [k, notFound()])) as Record<FieldKey, ParsedField>, warnings: [], ai_used: false };
}

/** Parses pasted confirmation text or .ics content. Never throws on odd input: unknown fields are "not_found". */
export function parseBooking(input: string, opts: { now?: Date } = {}): ParseResult {
  const now = opts.now ?? new Date();
  const text = input.replace(/\r\n?/g, "\n").replace(/[  ]/g, " ");
  const props = /BEGIN:VEVENT/i.test(text) ? parseVevent(text) : null;
  const result = emptyResult(props ? "ics" : "text");
  const safe = withoutInjection(text);
  if (safe.removed) result.warnings.push("Some lines looked like instructions to an AI and were ignored.");
  if (props) parseIcs(props, now, result);
  else fillFromText(safe.text, now, result);
  if (result.fields.starts_at.value && !result.fields.starts_at.note && result.format === "text") {
    const off = offsetMinutes(Date.parse(result.fields.starts_at.value), result.timezone);
    result.fields.starts_at.note = `Read as Sydney time (${off === 660 ? "AEDT, UTC+11" : off === 600 ? "AEST, UTC+10" : "local"}).`;
  }
  return result;
}
