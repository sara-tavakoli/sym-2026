import { ACCESS_LABELS, DAY_LABELS, type Evaluated, type MatchStatus, type Prefs } from "./api";

export const DEFAULT_PREFS: Prefs = { category: "", radius_km: 10 };

export const STATUS_META: Record<MatchStatus, { label: string; symbol: string; cls: string }> = {
  met: { label: "Meets", symbol: "✓", cls: "ok" },
  partial: { label: "Partly meets", symbol: "◐", cls: "info" },
  not_met: { label: "Doesn't meet", symbol: "✕", cls: "bad" },
  unverified: { label: "Not verified", symbol: "?", cls: "warn" },
};

/** Fit Finder category id -> the service names used by the appointment form. */
export const SERVICE_FOR_CATEGORY: Record<string, string> = {
  gp: "General Practitioner (GP)", dentist: "Dentist", physiotherapist: "Physiotherapy",
  psychologist: "Psychology / Counselling", optometrist: "Optometry",
};

export const EXAMPLES = [
  "Bulk-billing GP near Macquarie Park with wheelchair access, Saturday morning",
  "Female psychologist who speaks Mandarin, telehealth in the evening",
];

export const LANGUAGE_SUGGESTIONS = ["English", "Mandarin", "Cantonese", "Arabic", "Hindi", "Tamil", "Korean", "Japanese", "Vietnamese", "Indonesian", "Malay", "Greek", "Spanish", "French", "Portuguese", "Punjabi"];

/** Removes empty values so the prefs pass the server schema (used for saving and URLs). */
export function cleanPrefs(p: Partial<Prefs>): Prefs {
  const out: Prefs = { category: p.category ?? "", radius_km: p.radius_km ?? 10 };
  if (p.location?.trim()) out.location = p.location.trim();
  if (p.days?.length) out.days = p.days;
  if (p.time) out.time = p.time;
  if (p.mode) out.mode = p.mode;
  if (p.accessibility?.length) out.accessibility = p.accessibility;
  if (p.bulk_billing) out.bulk_billing = true;
  if (p.language?.trim()) out.language = p.language.trim();
  if (p.practitioner_gender) out.practitioner_gender = p.practitioner_gender;
  if (p.strict) out.strict = true;
  return out;
}

/** Short human summary of a set of prefs, e.g. for saved searches. */
export function describePrefs(p: Prefs, categoryName?: string): string {
  const parts: string[] = [categoryName ?? p.category];
  if (p.mode === "telehealth") parts.push("telehealth");
  else if (p.location) parts.push(`within ${p.radius_km ?? 10} km of ${p.location}`);
  if (p.days?.length) parts.push(p.days.map((d) => DAY_LABELS[d]).join("/"));
  if (p.time) parts.push(p.time);
  if (p.bulk_billing) parts.push("bulk billing");
  if (p.accessibility?.length) parts.push(p.accessibility.map((a) => ACCESS_LABELS[a].toLowerCase()).join(", "));
  if (p.language) parts.push(p.language);
  if (p.practitioner_gender) parts.push(`${p.practitioner_gender} practitioner`);
  return parts.join(" · ");
}

/** Provider details the directory has NOT verified, whether or not the user asked about them. */
export function unverifiedDetails(e: Evaluated): string[] {
  const p = e.provider, out: string[] = [];
  if (!p.hours.length) out.push("Opening hours not listed");
  else if (p.hours.some((h) => !h.verified_at)) out.push("Opening hours");
  if (!p.billing) out.push("Fees and billing not listed");
  else if (!p.billing.verified_at) out.push("Billing / fees");
  if (p.languages && !p.languages.verified_at) out.push("Languages");
  if (p.telehealth && !p.telehealth.verified_at) out.push("Telehealth");
  if (p.booking && !p.booking.verified_at) out.push("Booking link");
  for (const [k, v] of Object.entries(p.accessibility)) if (v && !v.verified_at) out.push(ACCESS_LABELS[k as keyof typeof ACCESS_LABELS]);
  return out;
}

export const FIELD_NAMES: Record<string, string> = {
  category: "Service", location: "Location", day: "Day", time: "Time of day", mode: "Appointment type",
  accessibility: "Accessibility", bulk_billing: "Bulk billing", language: "Language", practitioner_gender: "Practitioner",
};
