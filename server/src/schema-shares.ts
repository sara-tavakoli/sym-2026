import { db } from "./db.js";

// ---------- Clinician share loop ----------
// A patient shares one appointment's brief with their clinician through an unguessable link.
// Only the SHA-256 of the link token is stored (like sessions). Every row carries the patient's user_id,
// and deleting the appointment or the account removes the links, question ticks and plans.
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

db.exec(`
CREATE TABLE IF NOT EXISTS appointment_shares (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  first_viewed_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_shares_appt ON appointment_shares(appointment_id, user_id);

CREATE TABLE IF NOT EXISTS share_question_marks (
  share_id TEXT NOT NULL REFERENCES appointment_shares(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  point_id TEXT NOT NULL,
  addressed_at TEXT NOT NULL DEFAULT (${NOW}),
  PRIMARY KEY (share_id, point_id)
);

CREATE TABLE IF NOT EXISTS clinician_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  share_id TEXT REFERENCES appointment_shares(id) ON DELETE SET NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  imported_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_plans_appt ON clinician_plans(appointment_id, user_id);
CREATE INDEX IF NOT EXISTS idx_plans_pending ON clinician_plans(user_id, imported_at);
`);

// ---------- Consult workspace (forward migration, additive) ----------
// A clinician drafts notes and patient instructions from a consult transcript, reviews and approves them.
// One consult per appointment: draft -> approved (locked). The untouched draft is kept for Before / After.
db.exec(`
CREATE TABLE IF NOT EXISTS share_consults (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id TEXT NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  share_id TEXT REFERENCES appointment_shares(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  source TEXT NOT NULL CHECK (source IN ('ai','rules')),
  source_note TEXT,
  transcript TEXT NOT NULL,
  notes_json TEXT NOT NULL,
  draft_notes_json TEXT NOT NULL,
  instructions_json TEXT NOT NULL,
  draft_instructions_json TEXT NOT NULL,
  edited INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT,
  approved_at TEXT,
  summary TEXT,
  summary_source TEXT,
  plan_id TEXT REFERENCES clinician_plans(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_consults_user ON share_consults(user_id);

CREATE TABLE IF NOT EXISTS share_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  share_id TEXT REFERENCES appointment_shares(id) ON DELETE SET NULL,
  actor TEXT NOT NULL CHECK (actor IN ('patient','clinician','ai','system')),
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_share_events_appt ON share_events(appointment_id, user_id, created_at);
`);

const planCols = db.prepare("PRAGMA table_info(clinician_plans)").all() as { name: string }[];
for (const [col, type] of [["instructions_json", "TEXT"], ["summary", "TEXT"], ["consult_id", "TEXT"]] as const) {
  if (!planCols.some((c) => c.name === col)) db.exec(`ALTER TABLE clinician_plans ADD COLUMN ${col} ${type}`);
}
