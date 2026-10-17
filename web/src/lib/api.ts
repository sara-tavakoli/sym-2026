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
