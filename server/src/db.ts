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

// ---------- Draft briefs (preparation without an appointment) ----------
db.exec(`
CREATE TABLE IF NOT EXISTS draft_briefs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('chat','form')),
  notes_json TEXT NOT NULL,
  content_json TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_drafts_user ON draft_briefs(user_id, updated_at);
`);

// ---------- Fit Finder provider directory ----------
// Every attribute row carries its source and an optional verified_at; NULL means "not verified".
db.exec(`
CREATE TABLE IF NOT EXISTS service_categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY, suburb TEXT NOT NULL, state TEXT NOT NULL, postcode TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_locations_suburb ON locations(suburb COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_locations_postcode ON locations(postcode);
CREATE TABLE IF NOT EXISTS clinics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location_id TEXT NOT NULL REFERENCES locations(id),
  address TEXT,
  lat REAL NOT NULL, lng REAL NOT NULL,
  phone TEXT,
  is_fictional INTEGER NOT NULL DEFAULT 1,
  data_source TEXT NOT NULL,
  source_ref TEXT,
  verified_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_clinics_geo ON clinics(lat, lng);
CREATE INDEX IF NOT EXISTS idx_clinics_location ON clinics(location_id);
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES service_categories(id),
  is_fictional INTEGER NOT NULL DEFAULT 1,
  data_source TEXT NOT NULL,
  verified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_providers_category ON providers(category_id, clinic_id);
CREATE TABLE IF NOT EXISTS provider_attributes (
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (key IN ('language','telehealth','gender')),
  value TEXT NOT NULL,
  verified_at TEXT,
  source TEXT NOT NULL,
  PRIMARY KEY (provider_id, key, value)
);
CREATE TABLE IF NOT EXISTS clinic_hours (
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
  opens_min INTEGER NOT NULL, closes_min INTEGER NOT NULL,
  verified_at TEXT, source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hours_clinic ON clinic_hours(clinic_id, day);
CREATE TABLE IF NOT EXISTS clinic_billing (
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES service_categories(id),
  bulk_billing TEXT NOT NULL CHECK (bulk_billing IN ('all','some','none')),
  details TEXT, verified_at TEXT, source TEXT NOT NULL,
  PRIMARY KEY (clinic_id, category_id)
);
CREATE TABLE IF NOT EXISTS clinic_accessibility (
  clinic_id TEXT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  feature TEXT NOT NULL CHECK (feature IN ('wheelchair','accessible_parking','hearing_loop','accessible_toilet')),
  available INTEGER NOT NULL CHECK (available IN (0,1)),
  verified_at TEXT, source TEXT NOT NULL,
  PRIMARY KEY (clinic_id, feature)
);
CREATE TABLE IF NOT EXISTS booking_links (
  clinic_id TEXT PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
  url TEXT NOT NULL, verified_at TEXT, source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefs_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches(user_id, created_at);
`);
