// Turns a task's deadline wording ("in 2 weeks", "by Friday", "by 30 October") into a calendar date.
// Relative wording is resolved against the appointment's date (in Sydney time), because that is when
// the instruction was given. Deterministic: no AI. Unknown wording returns null (no due date).
import { DEFAULT_TZ, MONTH_RE, WEEKDAY_RE, addDays, addMonths, monthNum, validDate, weekdayNum, ymd, zonedDate } from "./tz.js";

const WORD_NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  "a couple of": 2, "a couple": 2, couple: 2, "a few": 3, few: 3,
};
const NUM = String.raw`(\d{1,3}|a couple of|a couple|a few|couple|few|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;
const UNIT = String.raw`(day|week|fortnight|month|year)s?`;

const toNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : WORD_NUM[s.toLowerCase()] ?? NaN);

function addUnit(date: string, n: number, unit: string): string {
  switch (unit) {
    case "day": return addDays(date, n);
    case "week": return addDays(date, 7 * n);
    case "fortnight": return addDays(date, 14 * n);
    case "month": return addMonths(date, n);
    default: return addMonths(date, 12 * n);
  }
}

/** Resolves deadline wording to YYYY-MM-DD, or null if it isn't a clear date or timeframe. */
export function resolveDueDate(deadline: string | null | undefined, appointmentStartsAt: string | null | undefined, tz = DEFAULT_TZ): string | null {
  if (!deadline || !appointmentStartsAt) return null;
  const startMs = Date.parse(appointmentStartsAt);
  if (Number.isNaN(startMs)) return null;
  const anchor = zonedDate(new Date(startMs), tz);
  const [ay] = anchor.split("-").map(Number);
  const s = deadline.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
  let m: RegExpExecArray | null;

  // Absolute dates first.
  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s)) && validDate(+m[1], +m[2], +m[3])) return ymd(+m[1], +m[2], +m[3]);
  const noYear = (mo: number, d: number): string | null => {
    if (!validDate(ay, mo, d) && !validDate(ay + 1, mo, d)) return null;
    const same = validDate(ay, mo, d) ? ymd(ay, mo, d) : null;
    return same && same >= anchor ? same : validDate(ay + 1, mo, d) ? ymd(ay + 1, mo, d) : null;
  };
  if ((m = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])/.exec(s))) {
    const d = +m[1], mo = +m[2];
    if (m[3]) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return validDate(y, mo, d) ? ymd(y, mo, d) : null; }
    return noYear(mo, d);
  }
  if ((m = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?(?: of)? ${MONTH_RE}\b\.?(?:,? (\d{4}))?`).exec(s))) {
    const d = +m[1], mo = monthNum(m[2]);
    if (m[3]) return validDate(+m[3], mo, d) ? ymd(+m[3], mo, d) : null;
    return noYear(mo, d);
  }
  if ((m = new RegExp(String.raw`\b${MONTH_RE}\.? (\d{1,2})(?:st|nd|rd|th)?\b(?:,? (\d{4}))?`).exec(s))) {
    const mo = monthNum(m[1]), d = +m[2];
    if (m[3]) return validDate(+m[3], mo, d) ? ymd(+m[3], mo, d) : null;
    return noYear(mo, d);
  }

  if (/\b(today|tonight|same day|this evening|this afternoon)\b/.test(s)) return anchor;
  if (/\btomorrow\b/.test(s)) return addDays(anchor, 1);
  if (/\bend of (the |this )?week\b/.test(s)) { const wd = new Date(anchor + "T00:00Z").getUTCDay(); return addDays(anchor, (7 - wd) % 7); }
  if (/\bend of next week\b/.test(s)) { const wd = new Date(anchor + "T00:00Z").getUTCDay(); return addDays(anchor, ((7 - wd) % 7) + 7); }
  const monthEnd = (offset: number) => {
    const [y, mo] = anchor.split("-").map(Number);
    const t = new Date(Date.UTC(y, mo + offset, 0)); // day 0 = last day of the previous month
    return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  };
  if (/\bend of (the |this )?month\b/.test(s)) return monthEnd(0);
  if (/\bend of next month\b/.test(s)) return monthEnd(1);
  if (/\bnext week\b/.test(s)) return addDays(anchor, 7);
  if (/\bnext month\b/.test(s)) return addMonths(anchor, 1);
  if (/\bnext year\b/.test(s)) return addMonths(anchor, 12);

  // Ranges ("in 2-3 weeks", "within 1 to 2 months"): use the later end, so a task isn't flagged overdue early.
  if ((m = new RegExp(String.raw`\b${NUM} ?(?:-|–|to|or) ?${NUM} ${UNIT}\b`).exec(s))) {
    const n = Math.max(toNum(m[1]), toNum(m[2]));
    if (Number.isFinite(n)) return addUnit(anchor, n, m[3]);
  }
  if ((m = new RegExp(String.raw`\b${NUM} ?${UNIT}\b`).exec(s))) {
    const n = toNum(m[1]);
    if (Number.isFinite(n) && n > 0 && n <= 400) return addUnit(anchor, n, m[2]);
  }
  if ((m = /\b(?:in|within) (?:a |the next )?(day|week|fortnight|month|year)\b/.exec(s))) return addUnit(anchor, 1, m[1]);

  // Weekdays ("by Friday", "next Tuesday"): the first such day after the appointment.
  if ((m = new RegExp(String.raw`\b${WEEKDAY_RE}\b`).exec(s))) {
    const target = weekdayNum(m[1]);
    const wd = new Date(anchor + "T00:00Z").getUTCDay();
    const diff = ((target - wd + 7) % 7) || 7;
    return addDays(anchor, diff);
  }
  return null;
}
