import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { newId, requireAuth } from "../auth.js";

export const appointmentsRouter = Router();
appointmentsRouter.use(requireAuth);

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

const body = z.object({
  starts_at: z.string().datetime({ message: "Enter a valid date and time" }),
  practitioner_name: z.string().trim().min(1, "Practitioner name is required").max(120),
  service_type: z.string().trim().min(1, "Service type is required").max(80),
  clinic_name: z.string().trim().min(1, "Clinic name is required").max(120),
  location: optionalText(200),
  purpose: optionalText(500),
});

// Per-appointment preparation status and task counts come from correlated subqueries
// that hit the (appointment_id) indexes, so the list stays one round trip.
const SELECT = `
  SELECT a.id, a.starts_at, a.practitioner_name, a.service_type, a.clinic_name, a.location, a.purpose,
    COALESCE((SELECT b.status FROM appointment_briefs b WHERE b.appointment_id = a.id),
             CASE WHEN EXISTS (SELECT 1 FROM preparation_notes p WHERE p.appointment_id = a.id) THEN 'notes' END,
             'none') AS prep_status,
    (SELECT COUNT(*) FROM follow_up_tasks t WHERE t.appointment_id = a.id AND t.status != 'completed') AS open_tasks,
    (SELECT COUNT(*) FROM follow_up_tasks t WHERE t.appointment_id = a.id AND t.status = 'completed') AS done_tasks,
    (SELECT COUNT(*) FROM visit_instructions i WHERE i.appointment_id = a.id) AS instruction_count,
    (SELECT COUNT(*) FROM clinician_plans cp WHERE cp.appointment_id = a.id AND cp.imported_at IS NULL) AS pending_plans,
    (SELECT bk.reference FROM bookings bk WHERE bk.appointment_id = a.id) AS booking_ref,
    (SELECT bk.mode FROM bookings bk WHERE bk.appointment_id = a.id) AS booking_mode,
    (SELECT sc.choice FROM brief_share_choices sc WHERE sc.appointment_id = a.id) AS share_choice
  FROM appointments a`;

const listQuery = z.object({
  scope: z.enum(["upcoming", "past", "all"]).default("upcoming"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

appointmentsRouter.get("/", (req, res) => {
  const q = listQuery.parse(req.query);
  const now = new Date().toISOString();
  const cond = q.scope === "upcoming" ? "AND a.starts_at >= ?" : q.scope === "past" ? "AND a.starts_at < ?" : "AND ? IS NOT NULL";
  const order = q.scope === "upcoming" ? "ASC" : "DESC";
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM appointments a WHERE a.user_id = ? ${cond}`).get(req.user!.id, now) as { n: number }).n;
  const items = db.prepare(`${SELECT} WHERE a.user_id = ? ${cond} ORDER BY a.starts_at ${order} LIMIT ? OFFSET ?`)
    .all(req.user!.id, now, q.pageSize, (q.page - 1) * q.pageSize);
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
});

appointmentsRouter.post("/", (req, res) => {
  const b = body.parse(req.body);
  const id = newId();
  db.prepare(`INSERT INTO appointments (id, user_id, starts_at, practitioner_name, service_type, clinic_name, location, purpose)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, req.user!.id, b.starts_at, b.practitioner_name, b.service_type, b.clinic_name, b.location, b.purpose);
  res.status(201).json(db.prepare(`${SELECT} WHERE a.id = ? AND a.user_id = ?`).get(id, req.user!.id));
});

// Every single-record route filters on user_id; another user's id is indistinguishable from a missing one (404).
appointmentsRouter.get("/:id", (req, res) => {
  const row = db.prepare(`${SELECT} WHERE a.id = ? AND a.user_id = ?`).get(req.params.id, req.user!.id);
  if (!row) return res.status(404).json({ error: "Appointment not found" });
  res.json(row);
});

appointmentsRouter.put("/:id", (req, res) => {
  const b = body.parse(req.body);
  const r = db.prepare(`UPDATE appointments SET starts_at=?, practitioner_name=?, service_type=?, clinic_name=?, location=?, purpose=?,
                        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ?`)
    .run(b.starts_at, b.practitioner_name, b.service_type, b.clinic_name, b.location, b.purpose, req.params.id, req.user!.id);
  if (r.changes === 0) return res.status(404).json({ error: "Appointment not found" });
  res.json(db.prepare(`${SELECT} WHERE a.id = ? AND a.user_id = ?`).get(req.params.id, req.user!.id));
});

// "Share brief with clinician?" Recording "private" makes keeping the brief to yourself an explicit, reversible choice.
appointmentsRouter.put("/:id/share-choice", (req, res) => {
  const { choice } = z.object({ choice: z.enum(["share", "private"]) }).parse(req.body);
  if (!db.prepare("SELECT 1 FROM appointments WHERE id = ? AND user_id = ?").get(req.params.id, req.user!.id)) return res.status(404).json({ error: "Appointment not found" });
  db.prepare(`INSERT INTO brief_share_choices (appointment_id, user_id, choice) VALUES (?,?,?)
              ON CONFLICT(appointment_id) DO UPDATE SET choice=excluded.choice, decided_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .run(req.params.id, req.user!.id, choice);
  res.json(db.prepare(`${SELECT} WHERE a.id = ? AND a.user_id = ?`).get(req.params.id, req.user!.id));
});

appointmentsRouter.delete("/:id", (req, res) => {
  const r = db.prepare("DELETE FROM appointments WHERE id = ? AND user_id = ?").run(req.params.id, req.user!.id);
  if (r.changes === 0) return res.status(404).json({ error: "Appointment not found" });
  res.json({ ok: true });
});
