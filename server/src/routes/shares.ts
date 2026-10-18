import { Router, type NextFunction, type Request, type Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db.js";
import { newId, requireAuth } from "../auth.js";
import { SECTIONS } from "../ai/brief.js";
import { loadBrief } from "./prep.js";
import { notifyBriefViewed, notifyPlanSent } from "../notifications.js";

// Mounted at /api/appointments/:id (patient, signed in) and /api/share (clinician, public link).
export const sharesRouter = Router({ mergeParams: true });
export const publicShareRouter = Router();
sharesRouter.use(requireAuth);

const pid = (req: Request) => (req.params as Record<string, string>).id;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const nowIso = () => new Date().toISOString();
const DEFAULT_TTL_DAYS = Number(process.env.SHARE_TTL_DAYS ?? 7);
const SHARE_COLS = "id, created_at, expires_at, revoked_at, first_viewed_at, view_count";
const PLAN_COLS = "id, author, text, created_at, imported_at";

interface ShareRow { id: string; created_at: string; expires_at: string; revoked_at: string | null; first_viewed_at: string | null; view_count: number }
const withStatus = (s: ShareRow) => ({ ...s, status: s.revoked_at ? "revoked" : s.expires_at <= nowIso() ? "expired" : "active" });

function ownsAppointment(req: Request, res: Response): boolean {
  const row = db.prepare("SELECT 1 FROM appointments WHERE id = ? AND user_id = ?").get(pid(req), req.user!.id);
  if (!row) res.status(404).json({ error: "Appointment not found" });
  return !!row;
}

/** Ticks are kept per link but shown per appointment, so a fresh link keeps what the clinician already ticked. */
function addressedMap(apptId: string, uid: string): Map<string, string> {
  const rows = db.prepare(
    `SELECT m.point_id, MIN(m.addressed_at) AS addressed_at FROM share_question_marks m
     JOIN appointment_shares s ON s.id = m.share_id
     WHERE s.appointment_id = ? AND s.user_id = ? AND m.user_id = ? GROUP BY m.point_id`).all(apptId, uid, uid) as { point_id: string; addressed_at: string }[];
  return new Map(rows.map((r) => [r.point_id, r.addressed_at]));
}

// ---------- Patient side ----------

sharesRouter.get("/shares", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  const uid = req.user!.id, apptId = pid(req);
  const shares = (db.prepare(`SELECT ${SHARE_COLS} FROM appointment_shares WHERE appointment_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC`).all(apptId, uid) as unknown as ShareRow[]).map(withStatus);
  const brief = loadBrief(apptId, uid);
  const addressed = addressedMap(apptId, uid);
  res.json({
    brief_status: brief?.status ?? null,
    shares,
    questions: (brief?.sections.questions ?? []).map((p) => ({ id: p.id, text: p.text, addressed_at: addressed.get(p.id) ?? null })),
  });
});

const createBody = z.object({ expires_in_days: z.number().int().min(1).max(30).default(DEFAULT_TTL_DAYS) });

sharesRouter.post("/shares", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  const uid = req.user!.id, apptId = pid(req);
  const b = createBody.parse(req.body ?? {});
  const brief = loadBrief(apptId, uid);
  if (!brief || SECTIONS.every((s) => brief.sections[s].length === 0)) {
    return res.status(400).json({ error: "Prepare a brief for this appointment first, then share it." });
  }
  const token = randomBytes(32).toString("hex");
  const id = newId();
  // The raw token is returned once and never stored; a database leak does not expose live links.
  db.prepare("INSERT INTO appointment_shares (id, user_id, appointment_id, token_hash, expires_at) VALUES (?,?,?,?,?)")
    .run(id, uid, apptId, sha(token), new Date(Date.now() + b.expires_in_days * 864e5).toISOString());
  const share = db.prepare(`SELECT ${SHARE_COLS} FROM appointment_shares WHERE id = ? AND user_id = ?`).get(id, uid) as unknown as ShareRow;
  res.status(201).json({ share: withStatus(share), token, path: `/c/${token}` });
});

sharesRouter.post("/shares/:shareId/revoke", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  const r = db.prepare("UPDATE appointment_shares SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND appointment_id = ? AND user_id = ?")
    .run(nowIso(), req.params.shareId, pid(req), req.user!.id);
  if (r.changes === 0) return res.status(404).json({ error: "Share link not found" });
  const share = db.prepare(`SELECT ${SHARE_COLS} FROM appointment_shares WHERE id = ? AND user_id = ?`).get(req.params.shareId, req.user!.id) as unknown as ShareRow;
  res.json({ share: withStatus(share) });
});

sharesRouter.get("/clinician-plans", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  res.json({ plans: db.prepare(`SELECT ${PLAN_COLS} FROM clinician_plans WHERE appointment_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC`).all(pid(req), req.user!.id) });
});

// Called once the patient has confirmed the checklist made from this plan.
sharesRouter.post("/clinician-plans/:planId/imported", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  const r = db.prepare("UPDATE clinician_plans SET imported_at = COALESCE(imported_at, ?) WHERE id = ? AND appointment_id = ? AND user_id = ?")
    .run(nowIso(), req.params.planId, pid(req), req.user!.id);
  if (r.changes === 0) return res.status(404).json({ error: "Plan not found" });
  res.json({ plan: db.prepare(`SELECT ${PLAN_COLS} FROM clinician_plans WHERE id = ? AND user_id = ?`).get(req.params.planId, req.user!.id) });
});

// ---------- Clinician side (public, token is the only credential) ----------

/** Keeps the link out of referrers, search engines and caches. Also applied to the /c/:token SPA page. */
export function shareHeaders(_req: Request, res: Response, next: NextFunction) {
  res.set({ "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" });
  next();
}
publicShareRouter.use(shareHeaders);

const limitMsg = { error: "Too many requests. Please try again later." };
const viewLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: limitMsg });
const tickLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, message: limitMsg });
const planLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: limitMsg });

interface LiveShare { id: string; user_id: string; appointment_id: string }
const GONE = { error: "This link is not available." };

/** Resolves a raw token to a live share. Unknown, expired and revoked links all return the same 404. */
function liveShare(req: Request, res: Response): LiveShare | null {
  const token = z.string().regex(/^[0-9a-f]{64}$/).safeParse(req.params.token);
  const row = token.success
    ? db.prepare("SELECT id, user_id, appointment_id FROM appointment_shares WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?").get(sha(token.data), nowIso()) as LiveShare | undefined
    : undefined;
  if (!row) res.status(404).json(GONE);
  return row ?? null;
}

function plansFor(share: LiveShare) {
  return db.prepare(`SELECT id, author, text, created_at FROM clinician_plans WHERE share_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC`).all(share.id, share.user_id);
}

publicShareRouter.get("/:token", viewLimiter, (req, res) => {
  const share = liveShare(req, res);
  if (!share) return;
  db.prepare("UPDATE appointment_shares SET view_count = view_count + 1, first_viewed_at = COALESCE(first_viewed_at, ?) WHERE id = ? AND user_id = ?").run(nowIso(), share.id, share.user_id);
  notifyBriefViewed(share);
  const appt = db.prepare("SELECT starts_at, practitioner_name, service_type, clinic_name FROM appointments WHERE id = ? AND user_id = ?").get(share.appointment_id, share.user_id);
  const name = (db.prepare("SELECT name FROM users WHERE id = ?").get(share.user_id) as { name: string }).name;
  const brief = loadBrief(share.appointment_id, share.user_id);
  const addressed = addressedMap(share.appointment_id, share.user_id);
  // Minimum necessary: first name only, no email or account details, no internal source field names.
  res.json({
    patient_first_name: name.trim().split(/\s+/)[0] || "Patient",
    appointment: appt,
    brief: brief && {
      status: brief.status,
      updated_at: brief.updated_at,
      sections: Object.fromEntries(SECTIONS.map((s) => [s, brief.sections[s].map((p) => ({
        id: p.id, text: p.text, quote: p.quote, ...(s === "questions" ? { addressed_at: addressed.get(p.id) ?? null } : {}),
      }))])),
    },
    plans: plansFor(share),
  });
});

publicShareRouter.post("/:token/questions/:pointId", tickLimiter, (req, res) => {
  const share = liveShare(req, res);
  if (!share) return;
  const { addressed } = z.object({ addressed: z.boolean() }).parse(req.body);
  const pointId = String(req.params.pointId);
  const brief = loadBrief(share.appointment_id, share.user_id);
  if (!brief?.sections.questions.some((p) => p.id === pointId)) return res.status(404).json({ error: "Question not found" });
  if (addressed) {
    db.prepare("INSERT OR IGNORE INTO share_question_marks (share_id, user_id, point_id) VALUES (?,?,?)").run(share.id, share.user_id, pointId);
  } else {
    db.prepare("DELETE FROM share_question_marks WHERE point_id = ? AND user_id = ? AND share_id IN (SELECT id FROM appointment_shares WHERE appointment_id = ? AND user_id = ?)")
      .run(pointId, share.user_id, share.appointment_id, share.user_id);
  }
  res.json({ id: pointId, addressed_at: addressedMap(share.appointment_id, share.user_id).get(pointId) ?? null });
});

const planBody = z.object({
  author: z.string().trim().min(1, "Add your name and role").max(120),
  text: z.string().trim().min(1, "Write the after-visit instructions first").max(6000, "Please keep instructions under 6,000 characters"),
});

publicShareRouter.post("/:token/plan", planLimiter, (req, res) => {
  const share = liveShare(req, res);
  if (!share) return;
  const b = planBody.parse(req.body);
  const id = newId();
  db.prepare("INSERT INTO clinician_plans (id, user_id, appointment_id, share_id, author, text) VALUES (?,?,?,?,?,?)").run(id, share.user_id, share.appointment_id, share.id, b.author, b.text);
  notifyPlanSent(share, b.author);
  res.status(201).json({ plan: db.prepare("SELECT id, author, text, created_at FROM clinician_plans WHERE id = ? AND user_id = ?").get(id, share.user_id), plans: plansFor(share) });
});
