// Forward migration + upkeep for follow-through: task categories, daily care calendar ticks and in-app notifications.
// Categories are applied by connection-local (TEMP) triggers calling registered SQL functions (same pattern as
// schema-nudges.ts), so every route or script that inserts tasks gets a category without changes.
import { db } from "./db.js";
import { CATEGORIES, DEFAULT_DAILY_DAYS, classifyTask } from "./categories.js";
import { DEFAULT_TZ, addDays, zonedDate } from "./import/tz.js";

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const cols = new Set((db.prepare("PRAGMA table_info(follow_up_tasks)").all() as { name: string }[]).map((c) => c.name));
const add = (name: string, def: string) => { if (!cols.has(name)) db.exec(`ALTER TABLE follow_up_tasks ADD COLUMN ${name} ${def}`); };
add("category", `TEXT CHECK (category IS NULL OR category IN (${CATEGORIES.map((c) => `'${c}'`).join(",")}))`);
add("duration_days", "INTEGER");
add("start_date", "TEXT"); // daily tasks: YYYY-MM-DD (Sydney) the task was confirmed
add("end_date", "TEXT");   // daily tasks: start_date + duration_days - 1
add("category_manual", "INTEGER NOT NULL DEFAULT 0"); // 1 once the patient picked the category themselves

db.exec(`
CREATE TABLE IF NOT EXISTS task_day_ticks (
  task_id TEXT NOT NULL REFERENCES follow_up_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (task_id, day)
);
CREATE INDEX IF NOT EXISTS idx_ticks_user ON task_day_ticks(user_id, day);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  dedupe_key TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
`);

export const sydneyToday = (now = new Date()) => zonedDate(now, DEFAULT_TZ);

db.function("carepath_category", { deterministic: true }, (title, source, deadline) =>
  classifyTask(String(title ?? ""), source === "Added manually" ? "" : String(source ?? ""), typeof deadline === "string" ? deadline : "").category);
db.function("carepath_duration", { deterministic: true }, (title, source) =>
  classifyTask(String(title ?? ""), source === "Added manually" ? "" : String(source ?? "")).duration_days ?? DEFAULT_DAILY_DAYS);
db.function("carepath_today", () => sydneyToday());

// Explicit category / duration on insert (e.g. chosen at review) wins; otherwise the rules decide.
// Daily tasks start on the day they were confirmed (Sydney) unless a start_date was given.
db.exec(`
CREATE TEMP TRIGGER IF NOT EXISTS trg_task_category_insert AFTER INSERT ON main.follow_up_tasks
BEGIN
  UPDATE follow_up_tasks SET category = COALESCE(NEW.category, carepath_category(NEW.title, NEW.source_text, NEW.deadline)) WHERE id = NEW.id;
  UPDATE follow_up_tasks SET
    duration_days = COALESCE(NEW.duration_days, carepath_duration(NEW.title, NEW.source_text)),
    start_date = COALESCE(NEW.start_date, carepath_today())
  WHERE id = NEW.id AND category = 'daily';
  UPDATE follow_up_tasks SET end_date = date(start_date, '+' || (duration_days - 1) || ' days')
  WHERE id = NEW.id AND category = 'daily' AND end_date IS NULL;
END;
`);

/** Gives rows created before this migration a category (and daily dates starting on the day they were created). */
export function backfillCategories(): number {
  const rows = db.prepare("SELECT id, title, source_text, deadline, created_at FROM follow_up_tasks WHERE category IS NULL").all() as
    { id: string; title: string; source_text: string; deadline: string | null; created_at: string }[];
  const upd = db.prepare("UPDATE follow_up_tasks SET category = ?, duration_days = ?, start_date = ?, end_date = ? WHERE id = ?");
  for (const r of rows) {
    const c = classifyTask(r.title, r.source_text === "Added manually" ? "" : r.source_text, r.deadline);
    const start = c.category === "daily" ? sydneyToday(new Date(r.created_at)) : null;
    upd.run(c.category, c.duration_days, start, start && addDays(start, (c.duration_days ?? DEFAULT_DAILY_DAYS) - 1), r.id);
  }
  return rows.length;
}
backfillCategories();
