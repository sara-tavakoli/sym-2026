import { randomUUID } from "node:crypto";
import { db } from "../db.js";

// Audit timeline for the share loop. Every row carries the patient's user_id; reads always filter by it.
export type Actor = "patient" | "clinician" | "ai" | "system";
export interface ShareRef { user_id: string; appointment_id: string; share_id?: string | null }
export interface ShareEvent { id: string; actor: Actor; type: string; message: string; created_at: string }

export function logEvent(ref: ShareRef, actor: Actor, type: string, message: string) {
  db.prepare("INSERT INTO share_events (id, user_id, appointment_id, share_id, actor, type, message) VALUES (?,?,?,?,?,?,?)")
    .run(randomUUID(), ref.user_id, ref.appointment_id, ref.share_id ?? null, actor, type, message.slice(0, 300));
}

/** Repeated edits within a few minutes collapse into one row (timestamp moves forward) so the timeline stays readable. */
export function logEditEvent(ref: ShareRef, message: string) {
  const last = db.prepare("SELECT id, type, created_at FROM share_events WHERE appointment_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .get(ref.appointment_id, ref.user_id) as { id: string; type: string; created_at: string } | undefined;
  if (last?.type === "consult_edited" && Date.now() - Date.parse(last.created_at) < 10 * 60_000) {
    db.prepare("UPDATE share_events SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), message = ? WHERE id = ? AND user_id = ?").run(message, last.id, ref.user_id);
  } else logEvent(ref, "clinician", "consult_edited", message);
}

export const listEvents = (appointmentId: string, userId: string): ShareEvent[] =>
  db.prepare("SELECT id, actor, type, message, created_at FROM share_events WHERE appointment_id = ? AND user_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(appointmentId, userId) as unknown as ShareEvent[];
