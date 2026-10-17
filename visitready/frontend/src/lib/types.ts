// Hand-written mirrors of backend/models/visit.py — keep in sync.

export interface Service { id: string; name: string; description: string; keywords: string[] }
export interface Practitioner { id: string; name: string; role: string; bio: string; languages: string[] }
export type SlotMode = "in_person" | "telehealth";
export interface Slot { id: string; practitioner_id: string; date: string; time: string; mode: SlotMode }
export interface Clinic {
  id: string; name: string; suburb: string; address: string; image: string; bulk_billing: boolean;
  rating: number; lat: number | null; lng: number | null; online: boolean; fictional: boolean;
  /** straight-line km from the searched location; null when not searched or online */
  distance_km: number | null; services: string[]; blurb: string;
  practitioners: Practitioner[]; slots: Slot[];
}
export interface Transcript { title: string; text: string }

export interface Patient { name: string; age: number; pronouns: string; suburb: string }
export type Preference = "in_person" | "telehealth" | "any";
export interface Questionnaire {
  main_concern: string; duration: string; consulted_before: "yes" | "no"; referral: string;
  location: string; preference: Preference; consent_reuse: boolean;
}
export interface PathwaySuggestion {
  service_id: string; service_name: string; headline: string; explanation: string;
  reasons: string[]; alternatives: string[]; emergency: boolean;
}
export interface BookingRequest { clinic_id: string; slot_id: string; service_id: string }
export interface Booking {
  reference: string; clinic_id: string; clinic_name: string; clinic_address: string;
  practitioner_id: string; practitioner_name: string; service_id: string; service_name: string;
  slot_id: string; date: string; time: string; mode: SlotMode; confirmed_at: string;
}
export interface PrepForm {
  main_concern: string; symptoms: string; duration: string; previous_care: string; history: string;
  medications: string; concerns: string; questions: string; prefilled_fields: string[];
}
export type PrepField = Exclude<keyof PrepForm, "prefilled_fields">;
export interface BriefPoint { id: string; section: string; text: string; source_field: string; source_text: string; edited: boolean }
export interface Brief {
  points: BriefPoint[]; status: "draft" | "saved"; shared: boolean; ai_source: "live" | "fallback";
  generated_at: string; saved_at: string | null;
}
export interface GenerateBriefRequest { prep: PrepForm; use_fallback: boolean }
export interface BriefUpdate { points: { id: string; text: string }[]; shared: boolean }

export type InstructionKind = "appointment" | "test" | "referral" | "medication" | "self_care";
export interface Instruction { id: string; kind: InstructionKind; text: string; approved: boolean }
export interface ClinicalNotes { subjective: string; objective: string; assessment: string; plan: string }
export interface Consult {
  transcript: string; notes: ClinicalNotes | null; instructions: Instruction[];
  status: "none" | "draft" | "approved"; ai_source: "live" | "fallback" | null;
  ai_notes: ClinicalNotes | null; ai_instructions: Instruction[]; edited: boolean;
  generated_at: string | null; approved_at: string | null; approved_by: string | null;
  patient_summary: string | null; classified_by: "ai" | "rules" | null;
}
export interface GenerateNotesRequest { transcript: string; use_fallback: boolean }
export interface ConsultUpdate { notes: ClinicalNotes; instructions: Instruction[] }
export type ApproveRequest = ConsultUpdate;

export type TaskStatus = "suggested" | "todo" | "in_progress" | "completed";
export type TaskCategory = "one_time" | "daily" | "follow_up" | "urgent";
export interface Task {
  id: string; title: string; kind: InstructionKind; source_instruction_id: string; source_text: string;
  verbatim: boolean; status: TaskStatus; confirmed_at: string | null;
  category: TaskCategory; duration_days: number | null; due_in_days: number | null;
  start_date: string | null; end_date: string | null; due_date: string | null; done_dates: string[];
  classified_by: "ai" | "rules";
}
export interface TaskDayToggle { date: string; done: boolean }
export interface VisitEvent { id: string; at: string; actor: "patient" | "clinician" | "ai" | "system"; actor_name: string; type: string; message: string }
export interface AppNotification {
  id: string; audience: "patient" | "clinician"; persona: string; title: string; body: string; link: string; created_at: string; read: boolean;
}
export interface ConfirmTasksRequest { task_ids: string[] }
export interface TaskStatusUpdate { status: Exclude<TaskStatus, "suggested"> }

export interface Persona {
  id: string; initials: string; patient: Patient; tagline: string; quote: string;
  demo_questionnaire: Questionnaire; demo_prep: PrepForm;
}

export interface Visit {
  id: string; persona: string; patient: Patient; questionnaire: Questionnaire | null; pathway: PathwaySuggestion | null;
  booking: Booking | null; prep: PrepForm | null; brief: Brief | null; consult: Consult; tasks: Task[];
  events: VisitEvent[]; updated_at: string; today: string;
}

export const PREP_LABELS: Record<PrepField, string> = {
  main_concern: "Main concern", symptoms: "Symptoms", duration: "Duration", previous_care: "Previous care",
  history: "Relevant history", medications: "Current medications", concerns: "Worries", questions: "Questions",
};

export const KIND_LABELS: Record<InstructionKind, string> = {
  appointment: "Appointment", test: "Test", referral: "Referral", medication: "Medication", self_care: "Self-care",
};

// Clinician portal — mirrors ClinicianProfile / ClinicianAppointment / ClinicianDashboard
export interface ClinicianProfile { id: string; name: string; role: string; clinic: string }
export interface ClinicianAppointment {
  persona: string; visit_id: string; patient: Patient; initials: string; concern: string | null;
  booking: Booking | null; brief_shared: boolean; consult_status: "none" | "draft" | "approved"; instructions_released: number;
}
export interface ClinicianDashboard { today: string; clinician: ClinicianProfile; appointments: ClinicianAppointment[] }

export const CATEGORY_META: Record<TaskCategory, { label: string; dot: string; chip: string; border: string }> = {
  urgent: { label: "Urgent", dot: "bg-[#DC2626]", chip: "bg-[#FEE2E2] text-[#991B1B]", border: "border-l-[#DC2626]" },
  daily: { label: "Daily", dot: "bg-[#16A34A]", chip: "bg-[#DCFCE7] text-[#166534]", border: "border-l-[#16A34A]" },
  follow_up: { label: "Follow-up appointment", dot: "bg-[#2563EB]", chip: "bg-[#DBEAFE] text-[#1E40AF]", border: "border-l-[#2563EB]" },
  one_time: { label: "One-time", dot: "bg-[#D97706]", chip: "bg-[#FEF3C7] text-[#92400E]", border: "border-l-[#D97706]" },
};

// Patient accounts — mirrors models/auth.py
export type Gender = "" | "female" | "male" | "non_binary" | "other" | "prefer_not_to_say";
export interface UserProfile { full_name: string; date_of_birth: string; mobile: string; preferred_name: string; gender: Gender }
export type ProfileUpdate = UserProfile;
export interface PublicUser {
  user_id: string; email: string; name: string; auth_providers: string[]; profile: UserProfile;
  profile_complete: boolean; missing_fields: (keyof UserProfile)[];
}
export interface OkResponse { ok: boolean; message: string | null }

// Location search — mirrors GeoPoint / NearbyClinics in models/visit.py
export interface GeoPoint { label: string; lat: number; lng: number; source: string }
export interface NearbyClinics {
  location: GeoPoint; radius_km: number; distance_method: string;
  clinics: Clinic[]; online: Clinic[]; outside_count: number; nearest_outside_km: number | null;
}
