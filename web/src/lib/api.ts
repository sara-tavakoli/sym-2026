export class ApiError extends Error {
  constructor(message: string, public status: number, public fields: { path: string; message: string }[] = []) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check your connection and try again.", 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? "Something went wrong", res.status, data?.fields);
  return data as T;
}

export const api = {
  get: <T,>(p: string) => request<T>("GET", p),
  post: <T,>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
  put: <T,>(p: string, b: unknown) => request<T>("PUT", p, b),
  patch: <T,>(p: string, b: unknown) => request<T>("PATCH", p, b),
  del: <T,>(p: string) => request<T>("DELETE", p),
};

export interface User { id: string; email: string; name: string }
export type PrepStatus = "none" | "notes" | "draft" | "confirmed";
export interface Appointment {
  id: string; starts_at: string; practitioner_name: string; service_type: string; clinic_name: string;
  location: string | null; purpose: string | null; prep_status: PrepStatus;
  open_tasks: number; done_tasks: number; instruction_count: number;
}
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface DashboardData {
  counts: { upcoming: number; past: number; prepared: number; open_tasks: number; done_tasks: number };
  upcoming: Pick<Appointment, "id" | "starts_at" | "practitioner_name" | "service_type" | "clinic_name" | "prep_status">[];
  recent: Pick<Appointment, "id" | "starts_at" | "practitioner_name" | "service_type" | "clinic_name" | "prep_status">[];
  openTasks: { id: string; title: string; status: string; deadline: string | null; needs_clarification: number; appointment_id: string; practitioner_name: string }[];
  doneTasks: { id: string; title: string; appointment_id: string; updated_at: string }[];
}

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

/** ISO (UTC) -> value for <input type="datetime-local"> in the browser's timezone. */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export const FIELD_LABELS: Record<string, string> = {
  main_concern: "Main concern", onset: "When it started", background: "Background", experiences: "What you've noticed", questions: "Your questions", additional: "Additional notes",
};
export type PrepNotes = Record<"main_concern" | "onset" | "background" | "experiences" | "questions" | "additional", string>;
export const SECTION_KEYS = ["reason", "timeline", "background", "questions", "notes"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export const SECTION_TITLES: Record<SectionKey, string> = {
  reason: "Main reason for the appointment", timeline: "Timeline", background: "Relevant background", questions: "Questions for the practitioner", notes: "Additional notes",
};
export interface BriefPoint { id: string; text: string; edited: boolean; user: boolean; field: string | null; quote: string | null }
export interface Brief { id: string; status: "draft" | "confirmed"; updated_at: string; dropped: number; sections: Record<SectionKey, BriefPoint[]> }

export type TaskStatus = "todo" | "in_progress" | "completed";
export interface Task {
  id: string; appointment_id: string; title: string; source_text: string; deadline: string | null; status: TaskStatus;
  needs_clarification: number; clarification_reason: string | null; notes: string | null; created_at: string; updated_at: string;
  practitioner_name?: string; starts_at?: string;
}
export interface ProposedTask {
  title: string; source_text: string; deadline: string | null; needs_clarification: boolean; clarification_reason: string | null; is_medication: boolean; notes?: string;
}
export const STATUS_LABELS: Record<TaskStatus, string> = { todo: "To do", in_progress: "In progress", completed: "Completed" };

export interface AssistantAction { label: string; href: string; kind: "internal" | "external" | "phone" | "create_brief" }
export interface ChatMessage {
  role: "user" | "assistant"; content: string;
  actions?: AssistantAction[]; safety?: "emergency" | "filtered" | null; search?: ExtractedPrefs | null;
}
export interface AssistantReply { reply: string; intent: string; safety: "emergency" | "filtered" | null; actions: AssistantAction[]; search: ExtractedPrefs | null }

// ---------- Draft briefs ----------
export interface DraftSummary { id: string; title: string; origin: "chat" | "form"; updated_at: string; points: number }
export interface Draft {
  id: string; title: string; origin: "chat" | "form"; created_at: string; updated_at: string;
  notes: PrepNotes;
  brief: { status: "draft"; dropped: number; sections: Record<SectionKey, BriefPoint[]> } | null;
}

// ---------- Fit Finder ----------
export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type AccessFeature = "wheelchair" | "accessible_parking" | "hearing_loop" | "accessible_toilet";
export interface Prefs {
  category: string; location?: string; radius_km?: number; days?: Day[]; time?: "morning" | "afternoon" | "evening";
  mode?: "in_person" | "telehealth"; accessibility?: AccessFeature[]; bulk_billing?: boolean; language?: string;
  practitioner_gender?: "female" | "male"; strict?: boolean;
}
export interface ExtractedPrefs {
  prefs: Partial<Prefs>; evidence: { field: string; value: string; quote: string }[]; dropped: number;
  location_known: boolean | null; location_resolved: string | null;
}
export type MatchStatus = "met" | "partial" | "not_met" | "unverified";
export interface Check { key: string; label: string; status: MatchStatus; detail: string }
type V<T> = { value: T; verified_at: string | null };
export interface ProviderRecord {
  id: string; name: string; category: { id: string; name: string }; is_fictional: boolean; data_source: string;
  clinic: { id: string; name: string; address: string | null; suburb: string; state: string; postcode: string; lat: number; lng: number; verified_at: string | null };
  languages: { values: string[]; verified_at: string | null } | null;
  telehealth: V<boolean> | null; gender: V<string> | null;
  hours: { day: number; opens: number; closes: number; verified_at: string | null }[];
  billing: { bulk_billing: "all" | "some" | "none"; details: string | null; verified_at: string | null } | null;
  accessibility: Partial<Record<AccessFeature, V<boolean>>>;
  booking: { url: string; verified_at: string | null } | null;
}
export interface Evaluated {
  provider: ProviderRecord; distance_km: number | null; checks: Check[]; why: string;
  summary: { met: number; partial: number; not_met: number; unverified: number; total: number };
}
export interface SearchResult { origin: { suburb: string; state: string; postcode: string } | null; total: number; page: number; pageSize: number; items: Evaluated[]; excluded_strict: number; prefs: Prefs }
export interface FitMeta {
  categories: { id: string; name: string }[]; locations: { suburb: string; state: string; postcode: string }[];
  accessibility: AccessFeature[]; days: Day[]; radii: number[]; notice: string;
}
export interface SavedSearch { id: string; name: string; created_at: string; prefs: Prefs }

export const DAY_LABELS: Record<Day, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
export const ACCESS_LABELS: Record<AccessFeature, string> = { wheelchair: "Wheelchair access", accessible_parking: "Accessible parking", hearing_loop: "Hearing loop", accessible_toilet: "Accessible toilet" };
export const fmtMinutes = (m: number) => { const h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? "pm" : "am", h12 = h % 12 || 12; return mm ? `${h12}:${String(mm).padStart(2, "0")} ${ap}` : `${h12} ${ap}`; };

/** Prefs <-> URL query string (arrays as comma lists), shared by Fit Finder, compare and assistant handoff. */
export function prefsToQuery(p: Partial<Prefs>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && !v.length)) continue;
    q.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return q.toString();
}
export function queryToPrefs(q: URLSearchParams): Partial<Prefs> {
  const list = (k: string) => (q.get(k) ? q.get(k)!.split(",").filter(Boolean) : undefined);
  const p: Partial<Prefs> = {};
  if (q.get("category")) p.category = q.get("category")!;
  if (q.get("location")) p.location = q.get("location")!;
  if (q.get("radius_km")) p.radius_km = Number(q.get("radius_km"));
  if (list("days")) p.days = list("days") as Day[];
  if (q.get("time")) p.time = q.get("time") as Prefs["time"];
  if (q.get("mode")) p.mode = q.get("mode") as Prefs["mode"];
  if (list("accessibility")) p.accessibility = list("accessibility") as AccessFeature[];
  if (q.get("bulk_billing") === "true") p.bulk_billing = true;
  if (q.get("language")) p.language = q.get("language")!;
  if (q.get("practitioner_gender")) p.practitioner_gender = q.get("practitioner_gender") as Prefs["practitioner_gender"];
  if (q.get("strict") === "true") p.strict = true;
  return p;
}
