import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../auth.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

// Every figure is computed from the user's own rows; a new user gets zeros and empty lists.
dashboardRouter.get("/", (req, res) => {
  const uid = req.user!.id;
  const now = new Date().toISOString();
  const apptCols = `a.id, a.starts_at, a.practitioner_name, a.service_type, a.clinic_name,
    COALESCE((SELECT b.status FROM appointment_briefs b WHERE b.appointment_id = a.id),
             CASE WHEN EXISTS (SELECT 1 FROM preparation_notes p WHERE p.appointment_id = a.id) THEN 'notes' END,
             'none') AS prep_status,
    (SELECT COUNT(*) FROM clinician_plans cp WHERE cp.appointment_id = a.id AND cp.imported_at IS NULL) AS pending_plans`;

  const upcoming = db.prepare(`SELECT ${apptCols} FROM appointments a WHERE a.user_id = ? AND a.starts_at >= ? ORDER BY a.starts_at ASC LIMIT 5`).all(uid, now);
  const recent = db.prepare(`SELECT ${apptCols} FROM appointments a WHERE a.user_id = ? AND a.starts_at < ? ORDER BY a.starts_at DESC LIMIT 5`).all(uid, now);
  const openTasks = db.prepare(
    `SELECT t.id, t.title, t.status, t.deadline, t.needs_clarification, t.appointment_id, a.practitioner_name
     FROM follow_up_tasks t JOIN appointments a ON a.id = t.appointment_id
     WHERE t.user_id = ? AND t.status != 'completed' ORDER BY t.created_at DESC LIMIT 8`).all(uid);
  const doneTasks = db.prepare(
    `SELECT t.id, t.title, t.appointment_id, t.updated_at FROM follow_up_tasks t
     WHERE t.user_id = ? AND t.status = 'completed' ORDER BY t.updated_at DESC LIMIT 5`).all(uid);

  const counts = db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM appointments WHERE user_id = @u AND starts_at >= @n) AS upcoming,
       (SELECT COUNT(*) FROM appointments WHERE user_id = @u AND starts_at < @n) AS past,
       (SELECT COUNT(*) FROM appointments a WHERE a.user_id = @u AND a.starts_at >= @n
          AND EXISTS (SELECT 1 FROM appointment_briefs b WHERE b.appointment_id = a.id AND b.status = 'confirmed')) AS prepared,
       (SELECT COUNT(*) FROM follow_up_tasks WHERE user_id = @u AND status != 'completed') AS open_tasks,
       (SELECT COUNT(*) FROM follow_up_tasks WHERE user_id = @u AND status = 'completed') AS done_tasks`
  ).get({ u: uid, n: now });

  res.json({ counts, upcoming, recent, openTasks, doneTasks });
});
