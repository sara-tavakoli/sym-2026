import { Router, type Request, type Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { db } from "../db.js";
import "../schema-circle.js";
import { newId, requireAuth } from "../auth.js";
import { SECTIONS } from "../ai/brief.js";
import { loadBrief } from "./prep.js";

// Mounted at /api/circle (the patient managing their own circle, plus invite acceptance)
// and /api/supporting (a member acting on someone else's circle).
export const circleRouter = Router();
export const supportingRouter = Router();
supportingRouter.use(requireAuth);

type Role = "viewer" | "helper";
const INVITE_TTL_DAYS = 7;
const MAX_PENDING_INVITES = 20;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const now = () => new Date().toISOString();
const param = (req: Request, k: string) => (req.params as Record<string, string>)[k];

// ---------- Shared helpers ----------

/** Records a circle event. `message` is written without the actor's name; the name is joined at read time. */
export function logActivity(ownerId: string, actorId: string, kind: string, message: string, taskId: string | null = null) {
  db.prepare("INSERT INTO care_activity (id, owner_id, actor_id, kind, task_id, message) VALUES (?,?,?,?,?,?)").run(newId(), ownerId, actorId, kind, taskId, message);
}

const hasCircle = (ownerId: string) => !!db.prepare("SELECT 1 FROM care_members WHERE owner_id = ? LIMIT 1").get(ownerId);

/** True when `memberId` is a helper in `ownerId`'s circle (the only people a task can be assigned to). */
export function isHelper(ownerId: string, memberId: string) {
  return !!db.prepare("SELECT 1 FROM care_members WHERE owner_id = ? AND member_id = ? AND role = 'helper'").get(ownerId, memberId);
}

const quote = (title: string) => `“${title.length > 80 ? title.slice(0, 77) + "…" : title}”`; // same curly quotes as the seeded demo activity
const userName = (id: string) => (db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? "someone";

/** Hook for the patient's own task route: logs completion and assignment, but only once a circle exists. */
export function logOwnerTaskChange(ownerId: string, taskId: string, title: string, before: { status: string; assignee: string | null }, after: { status: string; assignee: string | null }) {
  if (!hasCircle(ownerId)) return;
  if (after.status === "completed" && before.status !== "completed") logActivity(ownerId, ownerId, "task_completed", `marked ${quote(title)} done`, taskId);
  if (after.assignee !== before.assignee) {
    logActivity(ownerId, ownerId, "task_assigned", after.assignee ? `asked ${userName(after.assignee)} to take ${quote(title)}` : `took back ${quote(title)}`, taskId);
  }
}

function activity(ownerId: string) {
  return db.prepare(
    `SELECT c.id, c.kind, c.message, c.created_at, c.actor_id, COALESCE(u.name, 'Former member') AS actor_name
     FROM care_activity c LEFT JOIN users u ON u.id = c.actor_id
     WHERE c.owner_id = ? ORDER BY c.created_at DESC, c.rowid DESC LIMIT 10`).all(ownerId);
}

/** Removes a member's task assignments in one circle (on removal or demotion to viewer). */
const unassignAll = (ownerId: string, memberId: string) =>
  db.prepare("UPDATE follow_up_tasks SET assignee_user_id = NULL WHERE user_id = ? AND assignee_user_id = ? AND status != 'completed'").run(ownerId, memberId);

// ---------- Invite acceptance (public lookup, signed-in accept) ----------

const tokenParam = z.string().regex(/^[a-f0-9]{64}$/, "This invite link is not valid");

interface InviteRow { id: string; owner_id: string; owner_name: string; name: string; role: Role; expires_at: string; accepted_at: string | null; accepted_by: string | null; cancelled_at: string | null }
function findInvite(token: string) {
  return db.prepare(
    `SELECT i.id, i.owner_id, u.name AS owner_name, i.name, i.role, i.expires_at, i.accepted_at, i.accepted_by, i.cancelled_at
     FROM care_invites i JOIN users u ON u.id = i.owner_id WHERE i.token_hash = ?`).get(sha(token)) as InviteRow | undefined;
}
const inviteState = (i: InviteRow) => (i.cancelled_at ? "cancelled" : i.accepted_at ? "accepted" : i.expires_at <= now() ? "expired" : "pending");

// Public invite endpoints are rate limited per IP, like the clinician share links.
const joinLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 60, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});

// Anyone holding the link may see who sent it (the token is the secret); no emails are returned.
circleRouter.get("/join/:token", joinLimiter, (req, res) => {
  const parsed = tokenParam.safeParse(param(req, "token"));
  const inv = parsed.success ? findInvite(parsed.data) : undefined;
  if (!inv) return res.status(404).json({ error: "This invite link is not valid. Ask for a new one." });
  res.json({ owner_name: inv.owner_name, name: inv.name, role: inv.role, state: inviteState(inv), expires_at: inv.expires_at });
});

circleRouter.post("/join/:token", joinLimiter, requireAuth, (req, res) => {
  const parsed = tokenParam.safeParse(param(req, "token"));
  const inv = parsed.success ? findInvite(parsed.data) : undefined;
  if (!inv) return res.status(404).json({ error: "This invite link is not valid. Ask for a new one." });
  const uid = req.user!.id;
  if (inv.owner_id === uid) return res.status(400).json({ error: "This is your own invite link. Send it to the person you want to add." });
  const state = inviteState(inv);
  const done = () => res.json({ owner_id: inv.owner_id, owner_name: inv.owner_name, role: inv.role });
  // Re-accepting your own accepted invite is a no-op, as long as you are still in the circle.
  if (state === "accepted" && inv.accepted_by === uid && db.prepare("SELECT 1 FROM care_members WHERE owner_id = ? AND member_id = ?").get(inv.owner_id, uid)) return done();
  if (state === "cancelled") return res.status(410).json({ error: "This invite was cancelled. Ask for a new one." });
  if (state === "accepted") return res.status(410).json({ error: "This invite has already been used. Ask for a new one." });
  if (state === "expired") return res.status(410).json({ error: "This invite has expired. Ask for a new one." });

  db.exec("BEGIN");
  try {
    // An existing member accepting a newer invite takes the role from the newer invite.
    db.prepare(`INSERT INTO care_members (id, owner_id, member_id, role) VALUES (?,?,?,?)
                ON CONFLICT(owner_id, member_id) DO UPDATE SET role = excluded.role`).run(newId(), inv.owner_id, uid, inv.role);
    db.prepare("UPDATE care_invites SET accepted_at = ?, accepted_by = ? WHERE id = ?").run(now(), uid, inv.id);
    logActivity(inv.owner_id, uid, "member_joined", `joined the care circle as a ${inv.role}`);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  done();
});

// ---------- Owner: manage my circle ----------

circleRouter.use(requireAuth);

const memberCols = `m.id, m.member_id, u.name, u.email, m.role, m.created_at,
  (SELECT COUNT(*) FROM follow_up_tasks t WHERE t.user_id = m.owner_id AND t.assignee_user_id = m.member_id AND t.status != 'completed') AS open_tasks`;

circleRouter.get("/", (req, res) => {
  const uid = req.user!.id;
  res.json({
    members: db.prepare(`SELECT ${memberCols} FROM care_members m JOIN users u ON u.id = m.member_id WHERE m.owner_id = ? ORDER BY m.created_at`).all(uid),
    invites: db.prepare(`SELECT id, name, email, role, created_at, expires_at FROM care_invites
                         WHERE owner_id = ? AND accepted_at IS NULL AND cancelled_at IS NULL AND expires_at > ? ORDER BY created_at DESC`).all(uid, now()),
    activity: activity(uid),
  });
});

// Compact figures for the dashboard card: my circle, plus the circles I belong to.
circleRouter.get("/summary", (req, res) => {
  const uid = req.user!.id;
  res.json(db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM care_members WHERE owner_id = @u) AS members,
       (SELECT COUNT(*) FROM care_members WHERE owner_id = @u AND role = 'helper') AS helpers,
       (SELECT COUNT(*) FROM care_invites WHERE owner_id = @u AND accepted_at IS NULL AND cancelled_at IS NULL AND expires_at > @n) AS pending_invites,
       (SELECT COUNT(*) FROM follow_up_tasks WHERE user_id = @u AND assignee_user_id IS NOT NULL AND status != 'completed') AS tasks_taken,
       (SELECT COUNT(*) FROM care_members WHERE member_id = @u) AS supporting`).get({ u: uid, n: now() }));
});

// Helpers only (names, no emails): the people a task can be assigned to from the patient's task views.
circleRouter.get("/helpers", (req, res) => {
  res.json({ helpers: db.prepare("SELECT m.member_id, u.name FROM care_members m JOIN users u ON u.id = m.member_id WHERE m.owner_id = ? AND m.role = 'helper' ORDER BY u.name").all(req.user!.id) });
});

const role = z.enum(["viewer", "helper"], { message: "Choose Viewer or Helper" });
const inviteBody = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  role,
});

circleRouter.post("/invites", (req, res) => {
  const uid = req.user!.id;
  const b = inviteBody.parse(req.body);
  if (b.email === req.user!.email) return res.status(400).json({ error: "You can't invite yourself. Invite the person who helps with your care." });
  const pending = (db.prepare("SELECT COUNT(*) AS n FROM care_invites WHERE owner_id = ? AND accepted_at IS NULL AND cancelled_at IS NULL AND expires_at > ?").get(uid, now()) as { n: number }).n;
  if (pending >= MAX_PENDING_INVITES) return res.status(429).json({ error: "You have too many open invites. Cancel some first." });
  const token = randomBytes(32).toString("hex");
  const id = newId();
  const expires = new Date(Date.now() + INVITE_TTL_DAYS * 864e5).toISOString();
  db.prepare("INSERT INTO care_invites (id, owner_id, name, email, role, token_hash, expires_at) VALUES (?,?,?,?,?,?,?)").run(id, uid, b.name, b.email, b.role, sha(token), expires);
  // The raw token is returned exactly once; only its hash is stored.
  res.status(201).json({ invite: db.prepare("SELECT id, name, email, role, created_at, expires_at FROM care_invites WHERE id = ?").get(id), token, path: `/join/${token}` });
});

circleRouter.delete("/invites/:id", (req, res) => {
  const r = db.prepare("UPDATE care_invites SET cancelled_at = ? WHERE id = ? AND owner_id = ? AND accepted_at IS NULL AND cancelled_at IS NULL").run(now(), param(req, "id"), req.user!.id);
  if (r.changes === 0) return res.status(404).json({ error: "Invite not found" });
  res.json({ ok: true });
});

circleRouter.patch("/members/:id", (req, res) => {
  const uid = req.user!.id;
  const b = z.object({ role }).parse(req.body);
  const m = db.prepare("SELECT member_id FROM care_members WHERE id = ? AND owner_id = ?").get(param(req, "id"), uid) as { member_id: string } | undefined;
  if (!m) return res.status(404).json({ error: "Member not found" });
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE care_members SET role = ? WHERE id = ? AND owner_id = ?").run(b.role, param(req, "id"), uid);
    if (b.role === "viewer") unassignAll(uid, m.member_id); // viewers can't hold tasks
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.json(db.prepare(`SELECT ${memberCols} FROM care_members m JOIN users u ON u.id = m.member_id WHERE m.id = ?`).get(param(req, "id")));
});

// Removal takes effect on the member's very next request: every supporter route re-checks membership.
circleRouter.delete("/members/:id", (req, res) => {
  const uid = req.user!.id;
  const m = db.prepare("SELECT member_id FROM care_members WHERE id = ? AND owner_id = ?").get(param(req, "id"), uid) as { member_id: string } | undefined;
  if (!m) return res.status(404).json({ error: "Member not found" });
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM care_members WHERE id = ? AND owner_id = ?").run(param(req, "id"), uid);
    unassignAll(uid, m.member_id);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.json({ ok: true });
});

// ---------- Supporter: people I support ----------

/**
 * The single access check for every supporter route. Not a member -> 404 (indistinguishable from a
 * missing person); a viewer attempting a helper action -> 403. Returns the verified owner id and role.
 */
function circleAccess(req: Request, res: Response, need: Role): { ownerId: string; role: Role } | null {
  const ownerId = param(req, "ownerId");
  const row = db.prepare("SELECT role FROM care_members WHERE owner_id = ? AND member_id = ?").get(ownerId, req.user!.id) as { role: Role } | undefined;
  if (!row) { res.status(404).json({ error: "Not found" }); return null; }
  if (need === "helper" && row.role !== "helper") { res.status(403).json({ error: "Only helpers can update tasks. Ask them to make you a helper." }); return null; }
  return { ownerId, role: row.role };
}

supportingRouter.get("/", (req, res) => {
  const t = now();
  res.json({
    items: db.prepare(
      `SELECT m.owner_id, u.name, m.role, m.created_at,
         (SELECT COUNT(*) FROM appointments a WHERE a.user_id = m.owner_id AND a.starts_at >= @n) AS upcoming,
         (SELECT COUNT(*) FROM follow_up_tasks f WHERE f.user_id = m.owner_id AND f.status != 'completed') AS open_tasks,
         (SELECT COUNT(*) FROM follow_up_tasks f WHERE f.user_id = m.owner_id AND f.assignee_user_id = @u AND f.status != 'completed') AS my_tasks
       FROM care_members m JOIN users u ON u.id = m.owner_id WHERE m.member_id = @u ORDER BY u.name`).all({ u: req.user!.id, n: t }),
  });
});

// Deliberately narrow columns: no preparation notes, drafts, raw instructions, task notes or source quotes, and no emails.
const SUPPORT_TASK_COLS = `t.id, t.appointment_id, t.title, t.deadline, t.status, t.needs_clarification, t.assignee_user_id, t.updated_at,
  (SELECT u.name FROM users u WHERE u.id = t.assignee_user_id) AS assignee_name, a.practitioner_name, a.starts_at`;
const supportTask = (id: string, ownerId: string) =>
  db.prepare(`SELECT ${SUPPORT_TASK_COLS} FROM follow_up_tasks t JOIN appointments a ON a.id = t.appointment_id WHERE t.id = ? AND t.user_id = ?`).get(id, ownerId);

supportingRouter.get("/:ownerId", (req, res) => {
  const access = circleAccess(req, res, "viewer");
  if (!access) return;
  const { ownerId } = access;
  const appointments = db.prepare(
    `SELECT a.id, a.starts_at, a.practitioner_name, a.service_type, a.clinic_name, a.location,
       EXISTS (SELECT 1 FROM appointment_briefs b WHERE b.appointment_id = a.id AND b.user_id = a.user_id AND b.status = 'confirmed') AS brief_ready
     FROM appointments a WHERE a.user_id = ? AND a.starts_at >= ? ORDER BY a.starts_at ASC LIMIT 20`).all(ownerId, now());
  const tasks = db.prepare(
    `SELECT ${SUPPORT_TASK_COLS} FROM follow_up_tasks t JOIN appointments a ON a.id = t.appointment_id
     WHERE t.user_id = ? ORDER BY (t.status = 'completed'), t.created_at DESC, t.rowid DESC LIMIT 50`).all(ownerId);
  res.json({
    owner: { id: ownerId, name: userName(ownerId) },
    role: access.role,
    appointments,
    tasks,
    members: db.prepare("SELECT u.name, m.role FROM care_members m JOIN users u ON u.id = m.member_id WHERE m.owner_id = ? ORDER BY m.created_at").all(ownerId),
    activity: activity(ownerId),
  });
});

// Confirmed briefs only, point text only: source quotes come from preparation notes and are not shared.
supportingRouter.get("/:ownerId/appointments/:apptId/brief", (req, res) => {
  const access = circleAccess(req, res, "viewer");
  if (!access) return;
  const appt = db.prepare("SELECT id, starts_at, practitioner_name, service_type, clinic_name FROM appointments WHERE id = ? AND user_id = ?").get(param(req, "apptId"), access.ownerId);
  const brief = appt ? loadBrief(param(req, "apptId"), access.ownerId) : null;
  if (!appt || !brief || brief.status !== "confirmed") return res.status(404).json({ error: "No confirmed brief for this appointment" });
  const sections = Object.fromEntries(SECTIONS.map((s) => [s, brief.sections[s].map((p) => ({ id: p.id, text: p.text }))]));
  res.json({ appointment: appt, brief: { updated_at: brief.updated_at, sections } });
});

const supportPatch = z.object({
  status: z.enum(["todo", "in_progress", "completed"]).optional(),
  assign: z.enum(["me", "none"]).optional(),
}).refine((b) => b.status !== undefined || b.assign !== undefined, "Nothing to update");

supportingRouter.patch("/:ownerId/tasks/:taskId", (req, res) => {
  const access = circleAccess(req, res, "helper");
  if (!access) return;
  const { ownerId } = access, uid = req.user!.id, taskId = param(req, "taskId");
  const b = supportPatch.parse(req.body);
  const cur = db.prepare("SELECT title, status, assignee_user_id FROM follow_up_tasks WHERE id = ? AND user_id = ?").get(taskId, ownerId) as
    { title: string; status: string; assignee_user_id: string | null } | undefined;
  if (!cur) return res.status(404).json({ error: "Task not found" });
  // Helpers can take an unassigned task or release their own; they can't take one from someone else.
  if (b.assign && cur.assignee_user_id && cur.assignee_user_id !== uid) return res.status(409).json({ error: "Someone else has already taken this task." });
  const assignee = b.assign === "me" ? uid : b.assign === "none" ? null : cur.assignee_user_id;
  const status = b.status ?? cur.status;

  db.exec("BEGIN");
  try {
    db.prepare("UPDATE follow_up_tasks SET status = ?, assignee_user_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ?").run(status, assignee, taskId, ownerId);
    if (assignee !== cur.assignee_user_id) logActivity(ownerId, uid, assignee ? "task_taken" : "task_released", assignee ? `took on ${quote(cur.title)}` : `handed back ${quote(cur.title)}`, taskId);
    if (status !== cur.status) {
      if (status === "completed") logActivity(ownerId, uid, "task_completed", `marked ${quote(cur.title)} done`, taskId);
      else if (cur.status === "completed") logActivity(ownerId, uid, "task_reopened", `reopened ${quote(cur.title)}`, taskId);
      else if (status === "in_progress") logActivity(ownerId, uid, "task_started", `started ${quote(cur.title)}`, taskId);
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.json(supportTask(taskId, ownerId));
});
