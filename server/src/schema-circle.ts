import { db } from "./db.js";

// ---------- Care circle (family members / carers supporting a patient) ----------
// The patient is the owner; every circle row carries owner_id so access checks are one indexed lookup.
// Invite tokens are stored only as SHA-256, like session tokens.
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

db.exec(`
CREATE TABLE IF NOT EXISTS care_invites (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer','helper')),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_invites_owner ON care_invites(owner_id, created_at);

CREATE TABLE IF NOT EXISTS care_members (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer','helper')),
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  UNIQUE (owner_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_members_member ON care_members(member_id);

CREATE TABLE IF NOT EXISTS care_activity (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  task_id TEXT REFERENCES follow_up_tasks(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_activity_owner ON care_activity(owner_id, created_at);
`);

// Forward migration: who in the circle has taken on a task (NULL = the patient themselves / nobody).
const taskCols = db.prepare("PRAGMA table_info(follow_up_tasks)").all() as { name: string }[];
if (!taskCols.some((c) => c.name === "assignee_user_id")) {
  db.exec("ALTER TABLE follow_up_tasks ADD COLUMN assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
}
db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON follow_up_tasks(assignee_user_id)");
