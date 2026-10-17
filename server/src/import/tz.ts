// Small timezone helpers built on Intl (no dependencies). CarePath assumes Australia/Sydney when a
// booking gives no zone; Intl knows the AEDT/AEST switch dates, so offsets are always correct.

export const DEFAULT_TZ = "Australia/Sydney";

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try { formatter(tz); return true; } catch { return false; }
}

/** Wall-clock parts of an instant in a zone. */
export function zonedParts(date: Date, tz = DEFAULT_TZ) {
  const p: Record<string, number> = {};
  for (const part of formatter(tz).formatToParts(date)) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second };
}

/** Offset of the zone from UTC (minutes) at a given instant, e.g. +660 for AEDT, +600 for AEST. */
export function offsetMinutes(utcMs: number, tz = DEFAULT_TZ): number {
  const p = zonedParts(new Date(utcMs), tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** Converts a wall-clock time in a zone to the UTC instant. */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz = DEFAULT_TZ, second = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const off1 = offsetMinutes(guess, tz);
  let t = guess - off1 * 60000;
  const off2 = offsetMinutes(t, tz);
  if (off2 !== off1) t = guess - off2 * 60000;
  return new Date(t);
}

/** Calendar date (YYYY-MM-DD) of an instant in a zone. */
export function zonedDate(date: Date, tz = DEFAULT_TZ): string {
  const p = zonedParts(date, tz);
  return ymd(p.year, p.month, p.day);
}

export const ymd = (y: number, m: number, d: number) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** True if y-m-d is a real calendar date. */
export function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Day of week (0 = Sunday) of a calendar date. */
export const weekday = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

/** Adds days to a YYYY-MM-DD date. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Adds calendar months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return ymd(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(d, last));
}

/** Whole days from a to b (both YYYY-MM-DD); positive when b is later. */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}

export const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
export const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
export const WEEKDAY_RE = "(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
export const monthNum = (s: string) => MONTHS[s.toLowerCase().slice(0, 3)];
export const weekdayNum = (s: string) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(s.toLowerCase().slice(0, 3));
