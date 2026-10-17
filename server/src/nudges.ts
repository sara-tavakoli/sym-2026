// "Needs attention": a prioritised list of follow-ups the patient might otherwise forget.
// Everything is computed from the user's own rows (every query filters on user_id). Deterministic, no AI.
import { db } from "./db.js";
import { DEFAULT_TZ, addDays, daysBetween, zonedDate } from "./import/tz.js";

export type AttentionKind = "overdue" | "due_soon" | "clarify" | "prepare" | "add_instructions";
export type Severity = "high" | "medium" | "low";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  severity: Severity;
  title: string;
  detail: string;
  appointment_id: string;
  practitioner_name: string;
  clinic_name: string;
  starts_at: string;
  action: { label: string; href: string };
  task?: {
    id: string; title: string; source_text: string; deadline: string | null; due_date: string | null;
    needs_clarification: boolean; days_overdue: number | null; days_until_due: number | null;
  };
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const KIND_RANK: Record<AttentionKind, number> = { overdue: 0, prepare: 1, due_soon: 2, clarify: 3, add_instructions: 4 };
const DUE_SOON_DAYS = 3;
const PREPARE_WINDOW_H = 72;
const RECENT_PAST_DAYS = 14;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const dayLabel = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

interface TaskRow {
  id: string; title: string; source_text: string; deadline: string | null; due_date: string | null; needs_clarification: number;
  appointment_id: string; practitioner_name: string; clinic_name: string; starts_at: string;
}
interface ApptRow { id: string; practitioner_name: string; clinic_name: string; starts_at: string; prep_status: string }

export function getAttention(userId: string, now: Date = new Date(), tz = DEFAULT_TZ): { items: AttentionItem[]; today: string; counts: Record<Severity, number> } {
  const today = zonedDate(now, tz);
  const soon = addDays(today, DUE_SOON_DAYS);
  const nowIso = now.toISOString();
  const items: AttentionItem[] = [];

  const tasks = db.prepare(
    `SELECT t.id, t.title, t.source_text, t.deadline, t.due_date, t.needs_clarification, t.appointment_id,
            a.practitioner_name, a.clinic_name, a.starts_at
     FROM follow_up_tasks t JOIN appointments a ON a.id = t.appointment_id AND a.user_id = t.user_id
     WHERE t.user_id = ? AND t.status != 'completed' AND ((t.due_date IS NOT NULL AND t.due_date <= ?) OR t.needs_clarification = 1)
     ORDER BY t.due_date IS NULL, t.due_date, t.created_at LIMIT 100`).all(userId, soon) as unknown as TaskRow[];

  for (const t of tasks) {
    const overdueBy = t.due_date && t.due_date < today ? daysBetween(t.due_date, today) : null;
    const dueIn = t.due_date && t.due_date >= today ? daysBetween(today, t.due_date) : null;
    const clarify = !!t.needs_clarification;
    const href = `/app/appointments/${t.appointment_id}#follow-up`;
    const base = { appointment_id: t.appointment_id, practitioner_name: t.practitioner_name, clinic_name: t.clinic_name, starts_at: t.starts_at };
    const task = { id: t.id, title: t.title, source_text: t.source_text, deadline: t.deadline, due_date: t.due_date, needs_clarification: clarify, days_overdue: overdueBy, days_until_due: dueIn };
    if (overdueBy !== null) {
      items.push({ ...base, id: `task:${t.id}`, kind: "overdue", severity: "high", task, title: t.title,
        detail: `Overdue by ${plural(overdueBy, "day")} (was due ${dayLabel(t.due_date!)}) · from ${t.practitioner_name}`, action: { label: "Go to task", href } });
    } else if (dueIn !== null) {
      const when = dueIn === 0 ? "Due today" : dueIn === 1 ? "Due tomorrow" : `Due ${dayLabel(t.due_date!)} (in ${plural(dueIn, "day")})`;
      items.push({ ...base, id: `task:${t.id}`, kind: "due_soon", severity: dueIn === 0 ? "high" : "medium", task, title: t.title,
        detail: `${when} · from ${t.practitioner_name}`, action: { label: "Go to task", href } });
    } else if (clarify) {
      items.push({ ...base, id: `task:${t.id}`, kind: "clarify", severity: "medium", task, title: t.title,
        detail: `Unclear instruction from ${t.practitioner_name}. Check the details with the clinic.`, action: { label: "Go to task", href } });
    }
  }

  const prepCol = `COALESCE((SELECT b.status FROM appointment_briefs b WHERE b.appointment_id = a.id AND b.user_id = a.user_id),
             CASE WHEN EXISTS (SELECT 1 FROM preparation_notes p WHERE p.appointment_id = a.id AND p.user_id = a.user_id) THEN 'notes' END, 'none') AS prep_status`;
  const upcoming = db.prepare(
    `SELECT a.id, a.practitioner_name, a.clinic_name, a.starts_at, ${prepCol} FROM appointments a
     WHERE a.user_id = ? AND a.starts_at >= ? AND a.starts_at <= ?
       AND NOT EXISTS (SELECT 1 FROM appointment_briefs b WHERE b.appointment_id = a.id AND b.user_id = a.user_id AND b.status = 'confirmed')
     ORDER BY a.starts_at LIMIT 20`).all(userId, nowIso, new Date(now.getTime() + PREPARE_WINDOW_H * 3600_000).toISOString()) as unknown as ApptRow[];
  for (const a of upcoming) {
    const hours = Math.max(0, Math.round((Date.parse(a.starts_at) - now.getTime()) / 3600_000));
    const when = hours < 1 ? "in under an hour" : hours < 24 ? `in ${plural(hours, "hour")}` : `in ${plural(Math.round(hours / 24), "day")}`;
    const status = a.prep_status === "draft" ? "Your brief is still a draft." : a.prep_status === "notes" ? "You've started notes but haven't made a brief." : "You haven't prepared yet.";
    items.push({ id: `prepare:${a.id}`, kind: "prepare", severity: hours < 24 ? "high" : "medium", appointment_id: a.id, practitioner_name: a.practitioner_name,
      clinic_name: a.clinic_name, starts_at: a.starts_at, title: `Appointment with ${a.practitioner_name} ${when}`, detail: status,
      action: { label: "Prepare now", href: `/app/appointments/${a.id}/prepare` } });
  }

  const recent = db.prepare(
    `SELECT a.id, a.practitioner_name, a.clinic_name, a.starts_at, 'none' AS prep_status FROM appointments a
     WHERE a.user_id = ? AND a.starts_at < ? AND a.starts_at >= ?
       AND NOT EXISTS (SELECT 1 FROM visit_instructions i WHERE i.appointment_id = a.id AND i.user_id = a.user_id)
       AND NOT EXISTS (SELECT 1 FROM follow_up_tasks t WHERE t.appointment_id = a.id AND t.user_id = a.user_id)
     ORDER BY a.starts_at DESC LIMIT 20`).all(userId, nowIso, new Date(now.getTime() - RECENT_PAST_DAYS * 864e5).toISOString()) as unknown as ApptRow[];
  for (const a of recent) {
    const ago = daysBetween(zonedDate(new Date(a.starts_at), tz), today);
    items.push({ id: `instructions:${a.id}`, kind: "add_instructions", severity: "low", appointment_id: a.id, practitioner_name: a.practitioner_name,
      clinic_name: a.clinic_name, starts_at: a.starts_at, title: `Add your after-visit instructions from ${a.practitioner_name}`,
      detail: `Your visit was ${ago === 0 ? "today" : ago === 1 ? "yesterday" : `${ago} days ago`}. Note what you were told so follow-ups aren't missed.`,
      action: { label: "Add instructions", href: `/app/appointments/${a.id}#follow-up` } });
  }

  items.sort((x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity] || KIND_RANK[x.kind] - KIND_RANK[y.kind]
    || (x.task?.due_date ?? x.starts_at).localeCompare(y.task?.due_date ?? y.starts_at));
  const counts = { high: 0, medium: 0, low: 0 };
  for (const i of items) counts[i.severity]++;
  return { items: items.slice(0, 30), today, counts };
}
