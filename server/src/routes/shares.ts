import { Router, type NextFunction, type Request, type Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db.js";
import { newId, requireAuth } from "../auth.js";
import { SECTIONS } from "../ai/brief.js";
import { loadBrief } from "./prep.js";
import { notifyBriefShared, notifyBriefViewed, notifyPlanSent } from "../notifications.js";
import { aiInfo, AiError } from "../ai/client.js";
import { aiDraftConsult, aiSummary } from "../ai/consult.js";
import { draftNotes, extractInstructions, classify, rulesSummary, LIMITS, NOTE_KEYS, type Instruction, type Notes } from "../consult/rules.js";
import { pickSample } from "../consult/transcripts.js";
import { listEvents, logEditEvent, logEvent } from "../consult/events.js";

// Mounted at /api/appointments/:id (patient, signed in) and /api/share (clinician, public link).
export const sharesRouter = Router({ mergeParams: true });
export const publicShareRouter = Router();
sharesRouter.use(requireAuth);

const pid = (req: Request) => (req.params as Record<string, string>).id;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const nowIso = () => new Date().toISOString();
const DEFAULT_TTL_DAYS = Number(process.env.SHARE_TTL_DAYS ?? 7);
const SHARE_COLS = "id, created_at, expires_at, revoked_at, first_viewed_at, view_count";
const PLAN_COLS = "id, author, text, created_at, imported_at, instructions_json, summary, consult_id";

interface PlanRow { instructions_json?: string | null; [k: string]: unknown }
/** Structured instructions and the plain-language summary travel with the plan text (consult-approved plans only). */
const planOut = ({ instructions_json, ...p }: PlanRow) => ({ ...p, instructions: instructions_json ? JSON.parse(instructions_json) as unknown[] : null });

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
  db.prepare(`INSERT INTO brief_share_choices (appointment_id, user_id, choice) VALUES (?,?,'share')
              ON CONFLICT(appointment_id) DO UPDATE SET choice='share', decided_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(apptId, uid);
  const share = db.prepare(`SELECT ${SHARE_COLS} FROM appointment_shares WHERE id = ? AND user_id = ?`).get(id, uid) as unknown as ShareRow;
  notifyBriefShared(uid, apptId, "link", share.expires_at);
  logEvent({ user_id: uid, appointment_id: apptId, share_id: id }, "patient", "link_created", `Patient created a share link (expires in ${b.expires_in_days} day${b.expires_in_days === 1 ? "" : "s"})`);
  res.status(201).json({ share: withStatus(share), token, path: `/c/${token}` });
});

sharesRouter.post("/shares/:shareId/revoke", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  const before = db.prepare("SELECT revoked_at FROM appointment_shares WHERE id = ? AND appointment_id = ? AND user_id = ?").get(req.params.shareId, pid(req), req.user!.id) as { revoked_at: string | null } | undefined;
  const r = db.prepare("UPDATE appointment_shares SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND appointment_id = ? AND user_id = ?")
    .run(nowIso(), req.params.shareId, pid(req), req.user!.id);
  if (r.changes === 0) return res.status(404).json({ error: "Share link not found" });
  if (before && !before.revoked_at) logEvent({ user_id: req.user!.id, appointment_id: pid(req), share_id: String(req.params.shareId) }, "patient", "link_revoked", "Patient revoked a share link");
  const share = db.prepare(`SELECT ${SHARE_COLS} FROM appointment_shares WHERE id = ? AND user_id = ?`).get(req.params.shareId, req.user!.id) as unknown as ShareRow;
  res.json({ share: withStatus(share) });
});

sharesRouter.get("/clinician-plans", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  const rows = db.prepare(`SELECT ${PLAN_COLS} FROM clinician_plans WHERE appointment_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC`).all(pid(req), req.user!.id) as unknown as PlanRow[];
  res.json({ plans: rows.map(planOut) });
});

sharesRouter.get("/share-activity", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  res.json({ events: listEvents(pid(req), req.user!.id) });
});

// Called once the patient has confirmed the checklist made from this plan.
sharesRouter.post("/clinician-plans/:planId/imported", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  const prev = db.prepare("SELECT imported_at FROM clinician_plans WHERE id = ? AND appointment_id = ? AND user_id = ?").get(req.params.planId, pid(req), req.user!.id) as { imported_at: string | null } | undefined;
  const r = db.prepare("UPDATE clinician_plans SET imported_at = COALESCE(imported_at, ?) WHERE id = ? AND appointment_id = ? AND user_id = ?")
    .run(nowIso(), req.params.planId, pid(req), req.user!.id);
  if (r.changes === 0) return res.status(404).json({ error: "Plan not found" });
  if (prev && !prev.imported_at) logEvent({ user_id: req.user!.id, appointment_id: pid(req) }, "patient", "plan_imported", "Patient turned the after-visit plan into a checklist");
  res.json({ plan: planOut(db.prepare(`SELECT ${PLAN_COLS} FROM clinician_plans WHERE id = ? AND user_id = ?`).get(req.params.planId, req.user!.id) as unknown as PlanRow) });
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
const ref = (s: LiveShare) => ({ user_id: s.user_id, appointment_id: s.appointment_id, share_id: s.id });
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
  const first = db.prepare("UPDATE appointment_shares SET view_count = view_count + 1, first_viewed_at = COALESCE(first_viewed_at, ?) WHERE id = ? AND user_id = ? RETURNING view_count").get(nowIso(), share.id, share.user_id) as { view_count: number };
  if (first.view_count === 1) logEvent(ref(share), "clinician", "link_viewed", "Clinician opened the shared brief");
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
    consult: consultFor(share),
    events: listEvents(share.appointment_id, share.user_id),
  });
});

publicShareRouter.post("/:token/questions/:pointId", tickLimiter, (req, res) => {
  const share = liveShare(req, res);
  if (!share) return;
  const { addressed } = z.object({ addressed: z.boolean() }).parse(req.body);
  const pointId = String(req.params.pointId);
  const brief = loadBrief(share.appointment_id, share.user_id);
  if (!brief?.sections.questions.some((p) => p.id === pointId)) return res.status(404).json({ error: "Question not found" });
  const q = brief.sections.questions.find((p) => p.id === pointId)!.text;
  const short = q.length > 80 ? `${q.slice(0, 77)}...` : q;
  if (addressed) {
    const r = db.prepare("INSERT OR IGNORE INTO share_question_marks (share_id, user_id, point_id) VALUES (?,?,?)").run(share.id, share.user_id, pointId);
    if (r.changes) logEvent(ref(share), "clinician", "question_ticked", `Clinician marked a question as addressed: “${short}”`);
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
  logEvent(ref(share), "clinician", "plan_sent", "Clinician sent a written after-visit plan");
  res.status(201).json({ plan: db.prepare("SELECT id, author, text, created_at FROM clinician_plans WHERE id = ? AND user_id = ?").get(id, share.user_id), plans: plansFor(share) });
});

// ---------- Consult workspace (clinician, public link) ----------
// draft -> approved, enforced here: edits only while draft (409 after), approval needs every instruction ticked
// and the reviewed box (422 otherwise). Approval releases the instructions as a clinician plan for the patient.

const consultLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: limitMsg });
const editLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: true, legacyHeaders: false, message: limitMsg });

interface ConsultRow {
  id: string; status: "draft" | "approved"; source: "ai" | "rules"; source_note: string | null; transcript: string;
  notes_json: string; draft_notes_json: string; instructions_json: string; draft_instructions_json: string; edited: number;
  approved_by: string | null; approved_at: string | null; summary: string | null; summary_source: string | null; plan_id: string | null;
  created_at: string; updated_at: string;
}
const consultRow = (s: LiveShare) => db.prepare("SELECT * FROM share_consults WHERE appointment_id = ? AND user_id = ?").get(s.appointment_id, s.user_id) as unknown as ConsultRow | undefined;

function consultOut(c: ConsultRow) {
  return {
    id: c.id, status: c.status, source: c.source, source_note: c.source_note, transcript: c.transcript,
    notes: JSON.parse(c.notes_json) as Notes, draft_notes: JSON.parse(c.draft_notes_json) as Notes,
    instructions: JSON.parse(c.instructions_json) as Instruction[], draft_instructions: JSON.parse(c.draft_instructions_json) as Instruction[],
    edited: !!c.edited, approved_by: c.approved_by, approved_at: c.approved_at, summary: c.summary, summary_source: c.summary_source,
    created_at: c.created_at, updated_at: c.updated_at,
  };
}
function consultFor(s: LiveShare) { const c = consultRow(s); return c ? consultOut(c) : null; }

const sameNotes = (a: Notes, b: Notes) => NOTE_KEYS.every((k) => a[k] === b[k]);
const content = (list: Instruction[]) => JSON.stringify(list.map((i) => [i.id, i.text]));

publicShareRouter.get("/:token/consult", editLimiter, (req, res) => {
  const share = liveShare(req, res);
  if (!share) return;
  res.json({ consult: consultFor(share), events: listEvents(share.appointment_id, share.user_id) });
});

publicShareRouter.get("/:token/consult/sample", editLimiter, (req, res) => {
  const share = liveShare(req, res);
  if (!share) return;
  const appt = db.prepare("SELECT practitioner_name, service_type, purpose FROM appointments WHERE id = ? AND user_id = ?").get(share.appointment_id, share.user_id) as { practitioner_name: string; service_type: string; purpose: string | null };
  const name = (db.prepare("SELECT name FROM users WHERE id = ?").get(share.user_id) as { name: string }).name.trim().split(/\s+/)[0];
  const brief = loadBrief(share.appointment_id, share.user_id);
  const reason = brief ? brief.sections.reason.map((p) => p.text).join(" ") : "";
  res.json(pickSample(appt, name, reason));
});

const draftBody = z.object({
  transcript: z.string().trim().min(20, "Paste or load a consultation transcript first").max(LIMITS.transcript, "Please keep the transcript under 20,000 characters"),
});

publicShareRouter.post("/:token/consult/draft", consultLimiter, async (req, res, next) => {
  try {
    const share = liveShare(req, res);
    if (!share) return;
    const { transcript } = draftBody.parse(req.body);
    const existing = consultRow(share);
    if (existing?.status === "approved") return res.status(409).json({ error: "These notes are already approved and released. They can't be redrafted." });
    const prac = (db.prepare("SELECT practitioner_name FROM appointments WHERE id = ? AND user_id = ?").get(share.appointment_id, share.user_id) as { practitioner_name: string }).practitioner_name;

    let source: "ai" | "rules" = "rules";
    let note = "AI not configured";
    let notes: Notes | null = null, instructions: Instruction[] = [];
    if (aiInfo().configured) {
      try {
        const d = await aiDraftConsult(transcript, prac);
        if (d.instructions.length) {
          source = "ai"; notes = d.notes; instructions = d.instructions;
          note = d.dropped ? `${d.dropped} AI item${d.dropped === 1 ? " was" : "s were"} removed because ${d.dropped === 1 ? "it" : "they"} could not be traced to the transcript` : "";
        } else note = "AI draft had no instructions traceable to the transcript";
      } catch (e) {
        if (!(e instanceof AiError)) throw e;
        note = `AI unavailable: ${e.message}`;
      }
    }
    if (source === "rules") {
      instructions = extractInstructions(transcript, prac);
      notes = draftNotes(transcript, instructions, prac);
    }
    const nJson = JSON.stringify(notes), iJson = JSON.stringify(instructions);
    db.prepare(`INSERT INTO share_consults (id, user_id, appointment_id, share_id, status, source, source_note, transcript, notes_json, draft_notes_json, instructions_json, draft_instructions_json, edited)
                VALUES (?,?,?,?, 'draft', ?,?,?,?,?,?,?, 0)
                ON CONFLICT(appointment_id) DO UPDATE SET share_id = excluded.share_id, source = excluded.source, source_note = excluded.source_note, transcript = excluded.transcript,
                  notes_json = excluded.notes_json, draft_notes_json = excluded.draft_notes_json, instructions_json = excluded.instructions_json,
                  draft_instructions_json = excluded.draft_instructions_json, edited = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                WHERE share_consults.user_id = excluded.user_id AND share_consults.status = 'draft'`)
      .run(existing?.id ?? newId(), share.user_id, share.appointment_id, share.id, source, note || null, transcript, nJson, nJson, iJson, iJson);
    const n = instructions.length;
    logEvent(ref(share), source === "ai" ? "ai" : "system", "notes_drafted",
      `Draft notes and ${n} patient instruction${n === 1 ? "" : "s"} ${source === "ai" ? "drafted by AI" : `drafted by rules (${note || "AI not configured"})`} from the consult transcript`);
    res.status(201).json({ consult: consultFor(share), events: listEvents(share.appointment_id, share.user_id) });
  } catch (e) { next(e); }
});

const noteText = z.string().max(LIMITS.note, "Please keep each notes section under 4,000 characters");
const editBody = z.object({
  notes: z.object({ subjective: noteText, objective: noteText, assessment: noteText, plan: noteText }),
  instructions: z.array(z.object({
    id: z.string().max(64).optional(),
    text: z.string().trim().min(1, "An instruction can't be empty. Remove it instead.").max(LIMITS.instruction, "Please keep each instruction under 500 characters"),
    approved: z.boolean(),
  })).max(LIMITS.instructions, "Up to 20 instructions"),
});

publicShareRouter.put("/:token/consult", editLimiter, (req, res) => {
  const share = liveShare(req, res);
  if (!share) return;
  const b = editBody.parse(req.body);
  const c = consultRow(share);
  if (!c) return res.status(404).json({ error: "Draft the notes first." });
  if (c.status === "approved") return res.status(409).json({ error: "These notes are approved and locked. They can't be edited." });
  const savedList = JSON.parse(c.instructions_json) as Instruction[];
  const saved = new Map(savedList.map((i) => [i.id, i]));
  // Server-side rule: an instruction whose text changed (or a new one) is unticked, whatever the client sent.
  const instructions: Instruction[] = b.instructions.map((i) => {
    const old = i.id ? saved.get(i.id) : undefined;
    if (!old) return { id: newId(), text: i.text, quote: null, kind: classify(i.text), approved: false };
    const changed = old.text !== i.text;
    return { ...old, text: i.text, kind: changed ? classify(i.text) : old.kind, approved: changed ? false : i.approved };
  });
  const contentChanged = !sameNotes(JSON.parse(c.notes_json), b.notes) || content(instructions) !== content(savedList);
  const edited = !sameNotes(b.notes, JSON.parse(c.draft_notes_json)) || content(instructions) !== content(JSON.parse(c.draft_instructions_json));
  db.prepare("UPDATE share_consults SET notes_json = ?, instructions_json = ?, edited = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ? AND status = 'draft'")
    .run(JSON.stringify(b.notes), JSON.stringify(instructions), edited ? 1 : 0, c.id, share.user_id);
  if (contentChanged) logEditEvent(ref(share), "Clinician edited the draft notes and instructions");
  res.json({ consult: consultFor(share), events: listEvents(share.appointment_id, share.user_id) });
});

const approveBody = z.object({
  author: z.string().trim().min(1, "Add your name and role").max(LIMITS.author),
  reviewed: z.boolean(),
});

publicShareRouter.post("/:token/consult/approve", planLimiter, async (req, res, next) => {
  try {
    const share = liveShare(req, res);
    if (!share) return;
    const b = approveBody.parse(req.body);
    const c = consultRow(share);
    if (!c) return res.status(404).json({ error: "Draft the notes first." });
    if (c.status === "approved") return res.status(409).json({ error: "Already approved and released." });
    const ins = JSON.parse(c.instructions_json) as Instruction[];
    if (!b.reviewed) return res.status(422).json({ error: "Confirm you have reviewed the notes and instructions." });
    if (!ins.length) return res.status(422).json({ error: "Add at least one patient instruction before releasing." });
    const open = ins.filter((i) => !i.approved).length;
    if (open) return res.status(422).json({ error: `Tick every instruction first: ${open} still need${open === 1 ? "s" : ""} your approval.` });

    let summary: string | null = null, summarySource: "ai" | "rules" = "rules";
    if (aiInfo().configured) {
      try { summary = await aiSummary(b.author, ins); if (summary) summarySource = "ai"; } catch (e) { if (!(e instanceof AiError)) throw e; }
    }
    summary ??= rulesSummary(b.author, ins);

    // The status check is repeated inside the write so two concurrent approvals can't both release.
    const planId = newId();
    db.exec("BEGIN IMMEDIATE");
    try {
      const r = db.prepare("UPDATE share_consults SET status = 'approved', approved_by = ?, approved_at = ?, summary = ?, summary_source = ?, plan_id = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'draft'")
        .run(b.author, nowIso(), summary, summarySource, nowIso(), c.id, share.user_id);
      if (r.changes === 0) { db.exec("ROLLBACK"); return res.status(409).json({ error: "Already approved and released." }); }
      db.prepare("INSERT INTO clinician_plans (id, user_id, appointment_id, share_id, author, text, instructions_json, summary, consult_id) VALUES (?,?,?,?,?,?,?,?,?)")
        .run(planId, share.user_id, share.appointment_id, share.id, b.author, ins.map((i) => i.text).join("\n"),
          JSON.stringify(ins.map(({ id, text, kind, quote }) => ({ id, text, kind, quote }))), summary, c.id);
      db.prepare("UPDATE share_consults SET plan_id = ? WHERE id = ? AND user_id = ?").run(planId, c.id, share.user_id);
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    notifyPlanSent(share, b.author);
    logEvent(ref(share), "clinician", "approved", `Clinician approved the notes${c.edited ? " (edited from the draft)" : ""} and released ${ins.length} instruction${ins.length === 1 ? "" : "s"} to the patient`);
    res.json({ consult: consultFor(share), plans: plansFor(share), events: listEvents(share.appointment_id, share.user_id) });
  } catch (e) { next(e); }
});
