import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const path = process.env.DATABASE_PATH ?? "./data/carepath.db";
if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });

export const db = new DatabaseSync(path);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

// The full schema is created up front (all phases) so later phases need no migration of Phase 1 data.
// Every child table carries user_id so ownership is enforced with one indexed predicate.
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  practitioner_name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  clinic_name TEXT NOT NULL,
  location TEXT,
  purpose TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_appt_user_start ON appointments(user_id, starts_at);

CREATE TABLE IF NOT EXISTS preparation_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id TEXT NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  main_concern TEXT, onset TEXT, background TEXT, experiences TEXT, questions TEXT, additional TEXT,
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS appointment_briefs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id TEXT NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed')),
  content_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS brief_source_refs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brief_id TEXT NOT NULL REFERENCES appointment_briefs(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  point_id TEXT NOT NULL,
  source_field TEXT NOT NULL,
  source_text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refs_brief ON brief_source_refs(brief_id);

CREATE TABLE IF NOT EXISTS visit_instructions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_instr_appt ON visit_instructions(appointment_id);

CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  instruction_id TEXT REFERENCES visit_instructions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  source_text TEXT NOT NULL,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','completed')),
  needs_clarification INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON follow_up_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_appt ON follow_up_tasks(appointment_id);
`);

// Lightweight forward migration for databases created before this column existed.
const taskCols = db.prepare("PRAGMA table_info(follow_up_tasks)").all() as { name: string }[];
if (!taskCols.some((c) => c.name === "clarification_reason")) db.exec("ALTER TABLE follow_up_tasks ADD COLUMN clarification_reason TEXT");
