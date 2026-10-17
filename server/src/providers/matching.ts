import { z } from "zod";
import { ACCESS_FEATURES, type AccessFeature, type Location, type ProviderRecord } from "./directory.js";

/**
 * Deterministic, explainable matching. No AI is involved here: every status is computed from stored
 * provider attributes, and unverified or missing data is reported as "unverified", never as a match.
 */
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];
export const TIMES = { morning: [360, 720], afternoon: [720, 1020], evening: [1020, 1260] } as const;
export type TimeOfDay = keyof typeof TIMES;
export const RADII = [2, 5, 10, 20, 50] as const;

const csv = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => (typeof v === "string" ? (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []) : v), z.array(item).max(10)).optional();
const optStr = (max: number) => z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().min(1).max(max).optional());
const bool = z.preprocess((v) => (v === "true" || v === "1" ? true : v === "false" || v === "0" || v === "" ? false : v), z.boolean()).optional();

export const prefsSchema = z.object({
  category: z.string().trim().min(1).max(40),
  location: optStr(80),
  radius_km: z.coerce.number().refine((n) => (RADII as readonly number[]).includes(n), "Choose a valid distance").default(10),
  days: csv(z.enum(DAYS)),
  time: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["morning", "afternoon", "evening"]).optional()),
  mode: z.preprocess((v) => (v === "" || v === "either" ? undefined : v), z.enum(["in_person", "telehealth"]).optional()),
  accessibility: csv(z.enum(ACCESS_FEATURES as [AccessFeature, ...AccessFeature[]])),
  bulk_billing: bool,
  language: optStr(40),
  practitioner_gender: z.preprocess((v) => (v === "" || v === "any" ? undefined : v), z.enum(["female", "male"]).optional()),
  strict: bool,
});
export type Prefs = z.infer<typeof prefsSchema>;

export type Status = "met" | "partial" | "not_met" | "unverified";
export interface Check { key: string; label: string; status: Status; detail: string }
export interface Evaluated {
  provider: ProviderRecord;
  distance_km: number | null;
  checks: Check[];
  summary: { met: number; partial: number; not_met: number; unverified: number; total: number };
  why: string;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ACCESS_LABELS: Record<AccessFeature, string> = {
  wheelchair: "Wheelchair access", accessible_parking: "Accessible parking", hearing_loop: "Hearing loop", accessible_toilet: "Accessible toilet",
};
export const fmtTime = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? "pm" : "am", h12 = h % 12 || 12;
  return mm ? `${h12}:${String(mm).padStart(2, "0")} ${ap}` : `${h12} ${ap}`;
};
const dateOnly = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null);

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
export function bboxAround(loc: Location, km: number) {
  const dLat = km / 111, dLng = km / (111 * Math.cos((loc.lat * Math.PI) / 180));
  return { minLat: loc.lat - dLat, maxLat: loc.lat + dLat, minLng: loc.lng - dLng, maxLng: loc.lng + dLng };
}

function checkHours(p: ProviderRecord, prefs: Prefs): Check[] {
  const out: Check[] = [];
  const dayIdx = (prefs.days ?? []).map((d) => DAYS.indexOf(d));
  const anyVerified = p.hours.length > 0 && p.hours.every((h) => h.verified_at);
  const note = anyVerified ? "published hours" : "published hours, not verified";
  if (dayIdx.length) {
    const label = `Open on ${dayIdx.map((d) => DAY_NAMES[d]).join(" / ")}`;
    const open = p.hours.filter((h) => dayIdx.includes(h.day));
    if (!p.hours.length) out.push({ key: "days", label, status: "unverified", detail: "Opening hours not available" });
    else if (!open.length) out.push({ key: "days", label, status: anyVerified ? "not_met" : "unverified", detail: `Not open on ${dayIdx.map((d) => DAY_NAMES[d]).join(" / ")} (${note})` });
    else out.push({ key: "days", label, status: anyVerified ? "met" : "unverified", detail: `${open.map((h) => `${DAY_NAMES[h.day]} ${fmtTime(h.opens)}–${fmtTime(h.closes)}`).join(", ")} (${note})` });
  }
  if (prefs.time) {
    const [ws, we] = TIMES[prefs.time];
    const label = `Open in the ${prefs.time}`;
    const pool = dayIdx.length ? p.hours.filter((h) => dayIdx.includes(h.day)) : p.hours;
    const overlap = pool.filter((h) => h.opens < we && h.closes > ws);
    if (!p.hours.length) out.push({ key: "time", label, status: "unverified", detail: "Opening hours not available" });
    else if (!overlap.length) out.push({ key: "time", label, status: anyVerified ? "not_met" : "unverified", detail: `No ${prefs.time} opening hours${dayIdx.length ? " on your chosen days" : ""} (${note})` });
    else out.push({ key: "time", label, status: anyVerified ? "met" : "unverified", detail: `Open ${prefs.time}s on ${[...new Set(overlap.map((h) => DAY_NAMES[h.day]))].join(", ")} (${note})` });
  }
  return out;
}

export function evaluate(p: ProviderRecord, prefs: Prefs, origin: Location | null): Evaluated {
  const checks: Check[] = [];
  const distance_km = origin ? Math.round(haversineKm(origin, p.clinic) * 10) / 10 : null;

  if (origin && prefs.mode !== "telehealth") {
    checks.push({ key: "location", label: `Within ${prefs.radius_km} km of ${origin.suburb}`, status: "met", detail: `${distance_km} km away (straight-line distance)` });
  }
  checks.push(...checkHours(p, prefs));

  if (prefs.mode === "telehealth") {
    const t = p.telehealth;
    checks.push({
      key: "mode", label: "Offers telehealth",
      status: !t ? "unverified" : !t.verified_at ? "unverified" : t.value ? "met" : "not_met",
      detail: !t ? "Telehealth information not available" : `${t.value ? "Listed as offering telehealth" : "Does not offer telehealth"}${t.verified_at ? ` (verified ${dateOnly(t.verified_at)})` : " (not verified)"}`,
    });
  } else if (prefs.mode === "in_person") {
    checks.push({ key: "mode", label: "In-person appointments", status: "met", detail: `Clinic in ${p.clinic.suburb}` });
  }

  for (const f of prefs.accessibility ?? []) {
    const a = p.accessibility[f];
    checks.push({
      key: `access:${f}`, label: ACCESS_LABELS[f],
      status: !a || !a.verified_at ? "unverified" : a.value ? "met" : "not_met",
      detail: !a ? "Not verified — no information listed" : `${a.value ? "Available" : "Not available"}${a.verified_at ? ` (verified ${dateOnly(a.verified_at)})` : " (listed, not verified)"}`,
    });
  }

  if (prefs.bulk_billing) {
    const b = p.billing;
    const status: Status = !b || !b.verified_at ? "unverified" : b.bulk_billing === "all" ? "met" : b.bulk_billing === "some" ? "partial" : "not_met";
    checks.push({
      key: "billing", label: "Bulk billing", status,
      detail: !b ? "Not verified — no billing information listed. Ask the clinic about fees." : `${b.details ?? b.bulk_billing}${b.verified_at ? ` (verified ${dateOnly(b.verified_at)})` : " (not verified)"}`,
    });
  }

  if (prefs.language) {
    const want = prefs.language.toLowerCase();
    const l = p.languages;
    const has = l?.values.some((v) => v.toLowerCase() === want);
    checks.push({
      key: "language", label: `Speaks ${prefs.language}`,
      status: !l || !l.verified_at ? "unverified" : has ? "met" : "not_met",
      detail: !l ? "Languages not listed" : `Languages: ${l.values.join(", ")}${l.verified_at ? "" : " (not verified)"}`,
    });
  }

  if (prefs.practitioner_gender) {
    const g = p.gender;
    checks.push({
      key: "gender", label: `${prefs.practitioner_gender === "female" ? "Female" : "Male"} practitioner`,
      status: !g || !g.verified_at ? "unverified" : g.value === prefs.practitioner_gender ? "met" : "not_met",
      detail: !g ? "Not listed" : g.verified_at ? `Listed as ${g.value}` : `Listed as ${g.value} (not verified)`,
    });
  }

  const summary = {
    met: checks.filter((c) => c.status === "met").length,
    partial: checks.filter((c) => c.status === "partial").length,
    not_met: checks.filter((c) => c.status === "not_met").length,
    unverified: checks.filter((c) => c.status === "unverified").length,
    total: checks.length,
  };
  const why = [
    `${p.category.name}${distance_km !== null ? `, ${distance_km} km from ${origin!.suburb}` : ""}.`,
    summary.total ? `Meets ${summary.met} of ${summary.total} preferences${summary.partial ? `, partly meets ${summary.partial}` : ""}${summary.unverified ? `, ${summary.unverified} not verified` : ""}${summary.not_met ? `, ${summary.not_met} not met` : ""}.` : "Matches your chosen service.",
  ].join(" ");
  return { provider: p, distance_km, checks, summary, why };
}

/** Ranking is transparent: most preferences met, then partly met, then fewest unmet, then nearest, then name. */
export function rank(list: Evaluated[]): Evaluated[] {
  return [...list].sort((a, b) =>
    b.summary.met - a.summary.met ||
    b.summary.partial - a.summary.partial ||
    a.summary.not_met - b.summary.not_met ||
    (a.distance_km ?? 0) - (b.distance_km ?? 0) ||
    a.provider.name.localeCompare(b.provider.name));
}

export interface SearchResult { origin: Location | null; total: number; page: number; pageSize: number; items: Evaluated[]; excluded_strict: number }

export function search(candidates: ProviderRecord[], prefs: Prefs, origin: Location | null, page: number, pageSize: number): SearchResult {
  let evaluated = candidates.map((p) => evaluate(p, prefs, origin));
  // Distance is a hard filter for in-person searches; telehealth searches are not limited by distance.
  if (origin && prefs.mode !== "telehealth") evaluated = evaluated.filter((e) => (e.distance_km ?? 0) <= prefs.radius_km);
  const before = evaluated.length;
  if (prefs.strict) evaluated = evaluated.filter((e) => e.summary.not_met === 0);
  const ranked = rank(evaluated);
  return { origin, total: ranked.length, page, pageSize, items: ranked.slice((page - 1) * pageSize, page * pageSize), excluded_strict: before - ranked.length };
}
