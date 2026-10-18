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
export interface ClinicianPlan {
  id: string; author: string; text: string; created_at: string; imported_at?: string | null;
  /** Present when the plan was released from an approved consult. */
  instructions?: { id: string; text: string; kind: InstructionKind; quote: string | null }[] | null;
  summary?: string | null; consult_id?: string | null;
}

// ---------- Consult workspace ----------
export type InstructionKind = "test" | "medication" | "appointment" | "self_care" | "safety";
export const KIND_LABELS: Record<InstructionKind, string> = { test: "Test", medication: "Medicine", appointment: "Appointment", self_care: "Self-care", safety: "Safety net" };
export const NOTE_KEYS = ["subjective", "objective", "assessment", "plan"] as const;
export type NoteKey = (typeof NOTE_KEYS)[number];
export type ConsultNotes = Record<NoteKey, string>;
export const NOTE_LABELS: Record<NoteKey, string> = { subjective: "Subjective", objective: "Objective", assessment: "Assessment", plan: "Plan" };
export interface ConsultInstruction { id: string; text: string; quote: string | null; kind: InstructionKind; approved: boolean }
export interface Consult {
  id: string; status: "draft" | "approved"; source: "ai" | "rules"; source_note: string | null; transcript: string;
  notes: ConsultNotes; draft_notes: ConsultNotes; instructions: ConsultInstruction[]; draft_instructions: ConsultInstruction[];
  edited: boolean; approved_by: string | null; approved_at: string | null; summary: string | null; summary_source: "ai" | "rules" | null;
  created_at: string; updated_at: string;
}
export type EventActor = "patient" | "clinician" | "ai" | "system";
export interface ShareEvent { id: string; actor: EventActor; type: string; message: string; created_at: string }
export interface ConsultResponse { consult: Consult | null; events: ShareEvent[]; plans?: ClinicianPlan[] }

export interface SharedPoint { id: string; text: string; quote: string | null; addressed_at?: string | null }
export interface SharedView {
  patient_first_name: string;
  appointment: { starts_at: string; practitioner_name: string; service_type: string; clinic_name: string };
  brief: { status: "draft" | "confirmed"; updated_at: string; sections: Record<SectionKey, SharedPoint[]> } | null;
  plans: ClinicianPlan[];
  consult: Consult | null;
  events: ShareEvent[];
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
