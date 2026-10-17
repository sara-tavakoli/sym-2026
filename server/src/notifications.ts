// In-app notifications (no email or push). Every row belongs to one user and every query filters on user_id.
// Event hooks elsewhere call these helpers with one line each; they never throw into the calling route.
import { db } from "./db.js";
import { newId } from "./auth.js";
import { sydneyToday } from "./schema-followthrough.js";

export type NotificationKind = "brief_viewed" | "plan_sent" | "task_taken" | "task_completed" | "task_overdue";

const short = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Creates a notification. With a dedupe key, a second call with the same key for the same user is ignored. */
export function notify(userId: string, kind: NotificationKind, message: string, link: string | null = null, dedupeKey: string | null = null) {
  try {
    db.prepare("INSERT OR IGNORE INTO notifications (id, user_id, kind, message, link, dedupe_key) VALUES (?,?,?,?,?,?)")
      .run(newId(), userId, kind, short(message, 200), link, dedupeKey);
  } catch (e) {
    console.error("notify failed", e); // a notification must never break the action that triggered it
  }
}

interface ShareRef { id: string; user_id: string; appointment_id: string }
const practitioner = (s: ShareRef) =>
  (db.prepare("SELECT practitioner_name FROM appointments WHERE id = ? AND user_id = ?").get(s.appointment_id, s.user_id) as { practitioner_name: string } | undefined)?.practitioner_name;

/** Clinician opened a share link: at most one notification per link per day. */
export function notifyBriefViewed(share: ShareRef) {
  const who = practitioner(share);
  notify(share.user_id, "brief_viewed", `${who ?? "Your clinician"} viewed your brief`, `/app/appointments/${share.appointment_id}`, `viewed:${share.id}:${sydneyToday()}`);
}

/** Clinician sent an after-visit plan through a share link. */
export function notifyPlanSent(share: ShareRef, author: string) {
  notify(share.user_id, "plan_sent", `${short(author, 60)} sent your after-visit plan`, `/app/appointments/${share.appointment_id}#follow-up`);
}

/** A care-circle helper took on or completed one of the patient's tasks. */
export function notifyCircleTask(ownerId: string, actorId: string, taskId: string, title: string,
  before: { status: string; assignee: string | null }, after: { status: string; assignee: string | null }) {
  const name = (db.prepare("SELECT name FROM users WHERE id = ?").get(actorId) as { name: string } | undefined)?.name ?? "Someone";
  const appt = (db.prepare("SELECT appointment_id FROM follow_up_tasks WHERE id = ? AND user_id = ?").get(taskId, ownerId) as { appointment_id: string } | undefined)?.appointment_id;
  const link = appt ? `/app/appointments/${appt}#follow-up` : "/app/follow-up";
  if (after.assignee === actorId && before.assignee !== actorId) notify(ownerId, "task_taken", `${name} took on ‘${short(title)}’`, link);
  if (after.status === "completed" && before.status !== "completed") notify(ownerId, "task_completed", `${name} completed ‘${short(title)}’`, link);
}

/** Lazily records overdue tasks (one notification per task per day), called when attention or notifications are computed. */
export function syncOverdue(userId: string, now = new Date()) {
  const today = sydneyToday(now);
  const rows = db.prepare(
    `SELECT id, title, appointment_id FROM follow_up_tasks
     WHERE user_id = ? AND status != 'completed' AND due_date IS NOT NULL AND due_date < ? LIMIT 50`).all(userId, today) as
    { id: string; title: string; appointment_id: string }[];
  for (const t of rows) notify(userId, "task_overdue", `‘${short(t.title)}’ is overdue`, `/app/appointments/${t.appointment_id}#follow-up`, `overdue:${t.id}:${today}`);
}

export function listNotifications(userId: string) {
  syncOverdue(userId);
  return {
    items: db.prepare("SELECT id, kind, message, link, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 20").all(userId),
    unread: (db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").get(userId) as { n: number }).n,
  };
}
