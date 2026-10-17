// Forward migration + upkeep for "Needs attention" nudges: follow_up_tasks.due_date (nullable YYYY-MM-DD).
// due_date is derived from the task's deadline wording and its appointment's date (see import/due-dates.ts).
// It is kept current by connection-local (TEMP) triggers that call a registered SQL function, so every
// existing route that creates or edits tasks or moves an appointment stays correct without changes,
// and nothing is persisted in the database file that other tools (seed scripts, sqlite3 CLI) would trip over.
import { db } from "./db.js";
import { resolveDueDate } from "./import/due-dates.js";

const cols = db.prepare("PRAGMA table_info(follow_up_tasks)").all() as { name: string }[];
if (!cols.some((c) => c.name === "due_date")) db.exec("ALTER TABLE follow_up_tasks ADD COLUMN due_date TEXT");
db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON follow_up_tasks(user_id, due_date)");

db.function("carepath_due_date", { deterministic: true }, (deadline, startsAt) => {
  try {
    return resolveDueDate(typeof deadline === "string" ? deadline : null, typeof startsAt === "string" ? startsAt : null);
  } catch {
    return null;
  }
});

const DUE = "carepath_due_date(NEW.deadline, (SELECT a.starts_at FROM appointments a WHERE a.id = NEW.appointment_id))";
db.exec(`
CREATE TEMP TRIGGER IF NOT EXISTS trg_task_due_insert AFTER INSERT ON main.follow_up_tasks
BEGIN
  UPDATE follow_up_tasks SET due_date = ${DUE} WHERE id = NEW.id;
END;
CREATE TEMP TRIGGER IF NOT EXISTS trg_task_due_update AFTER UPDATE OF deadline, appointment_id ON main.follow_up_tasks
BEGIN
  UPDATE follow_up_tasks SET due_date = ${DUE} WHERE id = NEW.id;
END;
CREATE TEMP TRIGGER IF NOT EXISTS trg_appt_due_update AFTER UPDATE OF starts_at ON main.appointments
BEGIN
  UPDATE follow_up_tasks SET due_date = carepath_due_date(deadline, NEW.starts_at) WHERE appointment_id = NEW.id AND user_id = NEW.user_id;
END;
`);

/** Fills due_date for rows that have a deadline but no due date yet (rows created before this column existed). */
export function backfillDueDates(): number {
  return Number(db.prepare(
    `UPDATE follow_up_tasks SET due_date = carepath_due_date(deadline, (SELECT a.starts_at FROM appointments a WHERE a.id = follow_up_tasks.appointment_id))
     WHERE deadline IS NOT NULL AND due_date IS NULL`).run().changes);
}
backfillDueDates();
