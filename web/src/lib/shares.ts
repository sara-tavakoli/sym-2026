import { api, type SectionKey } from "./api";

// ---------- Clinician share loop ----------
export type ShareStatus = "active" | "expired" | "revoked";
export interface Share {
  id: string; created_at: string; expires_at: string; revoked_at: string | null;
  first_viewed_at: string | null; view_count: number; status: ShareStatus;
}
export interface SharesData {
  brief_status: "draft" | "confirmed" | null;
  shares: Share[];
  questions: { id: string; text: string; addressed_at: string | null }[];
}
export interface ClinicianPlan { id: string; author: string; text: string; created_at: string; imported_at?: string | null }

export interface SharedPoint { id: string; text: string; quote: string | null; addressed_at?: string | null }
export interface SharedView {
  patient_first_name: string;
  appointment: { starts_at: string; practitioner_name: string; service_type: string; clinic_name: string };
  brief: { status: "draft" | "confirmed"; updated_at: string; sections: Record<SectionKey, SharedPoint[]> } | null;
  plans: ClinicianPlan[];
}

export const CLINICIAN_TITLES: Record<SectionKey, string> = {
  reason: "Reason for visit", timeline: "Timeline", background: "Relevant background", questions: "Patient's questions", notes: "Notes",
};

export const markPlanImported = (appointmentId: string, planId: string) => api.post(`/appointments/${appointmentId}/clinician-plans/${planId}/imported`);

/** Copies text, falling back to selecting an input when the async clipboard is unavailable (e.g. plain http). */
export async function copyText(text: string, fallback?: HTMLInputElement | null): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  if (!fallback) return false;
  fallback.select();
  try { return document.execCommand("copy"); } catch { return false; }
}
