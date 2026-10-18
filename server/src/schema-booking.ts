import { db } from "./db.js";

// ---------- Booking a (fictional) clinic, the patient profile and the share decision ----------
// A booking is a normal appointment row plus a link to the directory provider it was booked with.
// The unique (provider_id, starts_at) index means a demo time can be booked by one person only.
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

db.exec(`
CREATE TABLE IF NOT EXISTS patient_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  date_of_birth TEXT NOT NULL,
  phone TEXT NOT NULL,
  emergency_name TEXT,
  emergency_phone TEXT,
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appointment_id TEXT NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('in_person','telehealth')),
  reference TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(provider_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);

-- "Share brief with clinician?" The patient's answer, so keeping the brief private is a decision, not a gap.
CREATE TABLE IF NOT EXISTS brief_share_choices (
  appointment_id TEXT PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  choice TEXT NOT NULL CHECK (choice IN ('share','private')),
  decided_at TEXT NOT NULL DEFAULT (${NOW})
);
`);
