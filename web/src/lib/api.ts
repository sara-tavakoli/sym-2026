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

export interface AssistantAction { label: string; href: string; kind: "internal" | "external" | "phone" }
export interface ChatMessage {
  role: "user" | "assistant"; content: string;
  actions?: AssistantAction[]; safety?: "emergency" | "filtered" | null;
}
export interface AssistantReply { reply: string; intent: string; safety: "emergency" | "filtered" | null; actions: AssistantAction[] }
