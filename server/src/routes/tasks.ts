import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { newId, requireAuth } from "../auth.js";
import { aiLimiter } from "../ai/limit.js";
import { AiError } from "../ai/client.js";
import { extractTasks } from "../ai/tasks.js";
import { isHelper, logOwnerTaskChange } from "./circle.js";
import { CATEGORIES, DEFAULT_DAILY_DAYS, MAX_DAILY_DAYS, classifyTask } from "../categories.js";
import { sydneyToday } from "../schema-followthrough.js";
import { addDays, daysBetween } from "../import/tz.js";

// Mounted at /api/appointments/:id (appointment-scoped) and /api/tasks (user-scoped).
export const instructionsRouter = Router({ mergeParams: true });
export const tasksRouter = Router();
instructionsRouter.use(requireAuth);
tasksRouter.use(requireAuth);

const pid = (req: Request) => (req.params as Record<string, string>).id;
const norm = (s: string) => s.toLowerCase().replace(/[\s ]+/g, " ").trim();
const TASK_COLS = "id, appointment_id, instruction_id, title, source_text, deadline, due_date, status, needs_clarification, clarification_reason, notes, created_at, updated_at, assignee_user_id, category, duration_days, start_date, end_date, category_manual";
// Care circle: the name of the member who has taken the task on (unqualified column resolves to the outer task row).
const ASSIGNEE = "(SELECT u.name FROM users u WHERE u.id = assignee_user_id) AS assignee_name";

// Daily tasks carry the days already ticked on their care calendar.
type Row = Record<string, unknown> & { id: string; category?: string | null };
const ticksStmt = () => db.prepare("SELECT day FROM task_day_ticks WHERE task_id = ? AND user_id = ? ORDER BY day");
function hydrate<T extends Row | undefined>(row: T, uid: string): T {
  if (!row) return row;
  return { ...row, ticks: row.category === "daily" ? (ticksStmt().all(row.id, uid) as { day: string }[]).map((d) => d.day) : [] } as T;
}
const hydrateAll = (rows: unknown[], uid: string) => (rows as Row[]).map((r) => hydrate(r, uid));
const category = z.enum(CATEGORIES);
const durationDays = z.number().int().min(1).max(MAX_DAILY_DAYS);

function ownsAppointment(req: Request, res: Response): boolean {
  const row = db.prepare("SELECT 1 FROM appointments WHERE id = ? AND user_id = ?").get(pid(req), req.user!.id);
  if (!row) res.status(404).json({ error: "Appointment not found" });
  return !!row;
}

const instructionText = z.string().trim().min(1, "Paste or type the instructions first").max(6000, "Please keep instructions under 6,000 characters");

instructionsRouter.post("/instructions/extract", aiLimiter, async (req, res) => {
  if (!ownsAppointment(req, res)) return;
  const { text } = z.object({ text: instructionText }).parse(req.body);
  try {
    // Nothing is stored here: the raw text is only saved if the user confirms the reviewed tasks.
    // Categories are suggestions shown at review; the patient can change them before confirming.
    res.json({ tasks: (await extractTasks(text)).map((t) => ({ ...t, ...classifyTask(t.title, t.source_text, t.deadline) })) });
  } catch (e) {
    if (e instanceof AiError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

const confirmBody = z.object({
  text: instructionText,
  tasks: z.array(z.object({
    title: z.string().trim().min(1, "Every task needs a title").max(200),
    source_text: z.string().trim().min(1).max(1000),
    deadline: z.string().trim().max(100).nullable().optional().transform((v) => v || null),
    needs_clarification: z.boolean().default(false),
    clarification_reason: z.string().trim().max(300).nullable().optional().transform((v) => v || null),
    notes: z.string().trim().max(2000).nullable().optional().transform((v) => v || null),
    category: category.optional(),
    duration_days: durationDays.nullable().optional(),
  })).min(1, "Keep at least one task to confirm").max(40),
});

instructionsRouter.post("/instructions/confirm", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  const uid = req.user!.id, apptId = pid(req);
  const b = confirmBody.parse(req.body);
  const hay = norm(b.text);
  if (b.tasks.some((t) => !hay.includes(norm(t.source_text)))) {
    return res.status(400).json({ error: "A task's source text doesn't match the instructions. Please re-run extraction." });
  }
  const instructionId = newId();
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO visit_instructions (id, user_id, appointment_id, raw_text) VALUES (?,?,?,?)").run(instructionId, uid, apptId, b.text);
    const ins = db.prepare(`INSERT INTO follow_up_tasks (id, user_id, appointment_id, instruction_id, title, source_text, deadline, needs_clarification, clarification_reason, notes,
                              category, duration_days, category_manual) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const t of b.tasks) {
      // The server re-applies the rules; a different choice made at review is kept and marked as the patient's own.
      const rule = classifyTask(t.title, t.source_text, t.deadline);
      const cat = t.category ?? rule.category;
      const dur = cat === "daily" ? t.duration_days ?? rule.duration_days ?? DEFAULT_DAILY_DAYS : null;
      ins.run(newId(), uid, apptId, instructionId, t.title, t.source_text, t.deadline, t.needs_clarification ? 1 : 0, t.clarification_reason, t.notes, cat, dur, cat !== rule.category ? 1 : 0);
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.status(201).json({ tasks: hydrateAll(db.prepare(`SELECT ${TASK_COLS}, ${ASSIGNEE} FROM follow_up_tasks WHERE instruction_id = ? AND user_id = ? ORDER BY created_at, rowid`).all(instructionId, uid), uid) });
});

instructionsRouter.get("/follow-up", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  const uid = req.user!.id;
  res.json({
    instructions: db.prepare("SELECT id, raw_text, created_at FROM visit_instructions WHERE appointment_id = ? AND user_id = ? ORDER BY created_at DESC").all(pid(req), uid),
    tasks: hydrateAll(db.prepare(`SELECT ${TASK_COLS}, ${ASSIGNEE} FROM follow_up_tasks WHERE appointment_id = ? AND user_id = ? ORDER BY created_at, rowid`).all(pid(req), uid), uid),
    today: sydneyToday(),
  });
});

instructionsRouter.post("/tasks", (req, res) => {
  if (!ownsAppointment(req, res)) return;
  const b = z.object({ title: z.string().trim().min(1, "Title is required").max(200) }).parse(req.body);
  const id = newId();
  db.prepare("INSERT INTO follow_up_tasks (id, user_id, appointment_id, title, source_text) VALUES (?,?,?,?,?)").run(id, req.user!.id, pid(req), b.title, "Added manually");
  res.status(201).json(hydrate(db.prepare(`SELECT ${TASK_COLS}, ${ASSIGNEE} FROM follow_up_tasks WHERE id = ?`).get(id) as Row, req.user!.id));
});

const listQuery = z.object({
  status: z.enum(["open", "completed", "all"]).default("open"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(15),
  category: category.optional(),
});

tasksRouter.get("/", (req, res) => {
  const q = listQuery.parse(req.query);
  let cond = q.status === "open" ? "AND t.status != 'completed'" : q.status === "completed" ? "AND t.status = 'completed'" : "";
  if (q.category) cond += ` AND t.category = '${q.category}'`; // enum-validated above
  const uid = req.user!.id;
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM follow_up_tasks t WHERE t.user_id = ? ${cond}`).get(uid) as { n: number }).n;
  const items = db.prepare(
    `SELECT ${TASK_COLS.split(", ").map((c) => "t." + c).join(", ")}, ${ASSIGNEE}, a.practitioner_name, a.starts_at
     FROM follow_up_tasks t JOIN appointments a ON a.id = t.appointment_id
     WHERE t.user_id = ? ${cond} ORDER BY t.created_at DESC, t.rowid DESC LIMIT ? OFFSET ?`).all(uid, q.pageSize, (q.page - 1) * q.pageSize);
  res.json({ items: hydrateAll(items, uid), total, page: q.page, pageSize: q.pageSize, today: sydneyToday() });
});

const patchBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  deadline: z.string().trim().max(100).nullable().optional(),
  status: z.enum(["todo", "in_progress", "completed"]).optional(),
  assignee_user_id: z.string().max(64).nullable().optional(),
  category: category.optional(),
  duration_days: durationDays.optional(),
});

interface TaskState {
  title: string; notes: string | null; deadline: string | null; status: string; assignee_user_id: string | null;
  category: string | null; duration_days: number | null; start_date: string | null; end_date: string | null; category_manual: number;
}
const getTask = (id: string, uid: string) => db.prepare(`SELECT ${TASK_COLS}, ${ASSIGNEE} FROM follow_up_tasks WHERE id = ? AND user_id = ?`).get(id, uid) as Row | undefined;

tasksRouter.patch("/:id", (req, res) => {
  const b = patchBody.parse(req.body);
  const uid = req.user!.id;
  const cur = db.prepare("SELECT title, notes, deadline, status, assignee_user_id, category, duration_days, start_date, end_date, category_manual FROM follow_up_tasks WHERE id = ? AND user_id = ?")
    .get(pid(req), uid) as TaskState | undefined;
  if (!cur) return res.status(404).json({ error: "Task not found" });
  const assignee = b.assignee_user_id === undefined ? cur.assignee_user_id : b.assignee_user_id || null;
  if (assignee && assignee !== cur.assignee_user_id && !isHelper(uid, assignee)) return res.status(400).json({ error: "Tasks can only be assigned to helpers in your care circle" });
  // Category: the patient's choice always wins. Daily tasks need a date range for their care calendar.
  const cat = b.category ?? cur.category;
  let { duration_days: dur, start_date: start, end_date: end } = cur;
  if (cat === "daily") {
    dur = b.duration_days ?? dur ?? DEFAULT_DAILY_DAYS;
    start = start ?? sydneyToday();
    end = addDays(start, dur - 1);
  } else { dur = null; start = null; end = null; }
  const manual = b.category !== undefined && b.category !== cur.category ? 1 : cur.category_manual;
  db.prepare(`UPDATE follow_up_tasks SET title=?, notes=?, deadline=?, status=?, assignee_user_id=?, category=?, duration_days=?, start_date=?, end_date=?, category_manual=?,
              updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND user_id=?`)
    .run(b.title ?? cur.title, (b.notes === undefined ? cur.notes : b.notes || null), (b.deadline === undefined ? cur.deadline : b.deadline || null), b.status ?? cur.status, assignee,
      cat, dur, start, end, manual, req.params.id, uid);
  logOwnerTaskChange(uid, String(req.params.id), b.title ?? cur.title, { status: cur.status, assignee: cur.assignee_user_id }, { status: b.status ?? cur.status, assignee });
  res.json(hydrate(getTask(String(req.params.id), uid), uid));
});

// ---------- Daily care calendar ----------
const dayBody = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date"), done: z.boolean() });

tasksRouter.post("/:id/days", (req, res) => {
  const uid = req.user!.id, id = String(req.params.id);
  const b = dayBody.parse(req.body);
  const cur = db.prepare("SELECT title, status, assignee_user_id, category, start_date, end_date FROM follow_up_tasks WHERE id = ? AND user_id = ?").get(id, uid) as
    Pick<TaskState, "title" | "status" | "assignee_user_id" | "category" | "start_date" | "end_date"> | undefined;
  if (!cur) return res.status(404).json({ error: "Task not found" });
  if (cur.category !== "daily" || !cur.start_date || !cur.end_date) return res.status(422).json({ error: "Only daily tasks have days to tick" });
  if (b.day > sydneyToday()) return res.status(422).json({ error: "You can't tick a day that hasn't happened yet" });
  if (b.day < cur.start_date || b.day > cur.end_date) return res.status(422).json({ error: "That day isn't part of this task" });
  if (b.done) db.prepare("INSERT OR IGNORE INTO task_day_ticks (task_id, user_id, day) VALUES (?,?,?)").run(id, uid, b.day);
  else db.prepare("DELETE FROM task_day_ticks WHERE task_id = ? AND user_id = ? AND day = ?").run(id, uid, b.day);
  // Auto-complete once every day in the range is ticked; unticking a day reopens an auto-completed task.
  const total = daysBetween(cur.start_date, cur.end_date) + 1;
  const ticked = (db.prepare("SELECT COUNT(*) AS n FROM task_day_ticks WHERE task_id = ? AND user_id = ? AND day BETWEEN ? AND ?").get(id, uid, cur.start_date, cur.end_date) as { n: number }).n;
  const status = ticked >= total ? "completed" : cur.status === "completed" && !b.done ? "in_progress" : ticked > 0 && cur.status === "todo" ? "in_progress" : cur.status;
  if (status !== cur.status) {
    db.prepare("UPDATE follow_up_tasks SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ?").run(status, id, uid);
    logOwnerTaskChange(uid, id, cur.title, { status: cur.status, assignee: cur.assignee_user_id }, { status, assignee: cur.assignee_user_id });
  }
  res.json(hydrate(getTask(id, uid), uid));
});

tasksRouter.delete("/:id", (req, res) => {
  const r = db.prepare("DELETE FROM follow_up_tasks WHERE id = ? AND user_id = ?").run(req.params.id, req.user!.id);
  if (r.changes === 0) return res.status(404).json({ error: "Task not found" });
  res.json({ ok: true });
});
