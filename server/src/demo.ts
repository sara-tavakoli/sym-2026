import { Router } from "express";
import rateLimit from "express-rate-limit";
import { randomBytes } from "node:crypto";
import { db } from "./db.js";
import { SESSION_COOKIE, createSession, hashPassword, newId, requireAuth } from "./auth.js";
import { saveBrief } from "./routes/prep.js";
import type { ViewSections } from "./briefs.js";
import { addDays, zonedParts, zonedToUtc } from "./import/tz.js";
import { sydneyToday } from "./schema-followthrough.js";

// One-click demo: every visitor gets a private, throwaway account seeded with FICTIONAL data,
// so judges can click through real flows without colliding with each other. Accounts expire after 24 h.
export const DEMO_DOMAIN = "demo.carepath.example";
const DEMO_TTL_HOURS = 24;

export const demoRouter = Router();
const limiter = rateLimit({
  windowMs: 60 * 60_000, limit: Number(process.env.DEMO_RATE_LIMIT_PER_HOUR ?? 30), standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many demo accounts from this network. Please try again later." },
});

// Wall-clock times in Sydney, not the server's zone: the host runs in UTC, which put "10:15am" visits at 9:15pm
// for Australian visitors and pushed "tomorrow" out by a day.
export const at = (days: number, hour: number, minute = 0, now = new Date()) => {
  const t = zonedParts(now);
  const d = new Date(Date.UTC(t.year, t.month - 1, t.day + days));
  return zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour, minute).toISOString();
};

const point = (text: string, field: string, quote: string) => ({ id: newId(), text, edited: false, user: false, field, quote });

/** Seeds a realistic, fictional patient journey: before (prepared brief), after (instructions + tasks), plus a visit to prepare for. */
export function seedDemo(uid: string, lockedHash: string) {
  const appt = db.prepare(`INSERT INTO appointments (id, user_id, starts_at, practitioner_name, service_type, clinic_name, location, purpose)
                           VALUES (?,?,?,?,?,?,?,?)`);
  const gp = newId(), past = newId(), dental = newId();
  appt.run(gp, uid, at(2, 10, 15), "Dr Priya Lee", "General Practitioner (GP)", "Harbourside Family Practice (fictional)", "12 Example St, Sydney NSW 2000", "Headaches and feeling tired");
  appt.run(past, uid, at(-9, 14, 30), "Dr Priya Lee", "General Practitioner (GP)", "Harbourside Family Practice (fictional)", "12 Example St, Sydney NSW 2000", "Dizziness when standing up");
  appt.run(dental, uid, at(1, 16, 0), "Dr Tom Nguyen", "Dentist", "Smile Bright Dental (fictional)", "88 Sample Rd, Newtown NSW 2042", "Check-up and clean");

  const notes = {
    main_concern: "I keep getting headaches most afternoons and I feel tired even after sleeping 8 hours.",
    onset: "Started about three weeks ago, around when semester exams began.",
    background: "I wear glasses for reading. I had my iron checked last year and it was a bit low.",
    experiences: "Headaches are worse after long study sessions on my laptop. Better on weekends. Coffee helps a little.",
    questions: "Could my screen time be causing the headaches? Should I get my eyes tested again? Could this be related to my iron?",
    additional: "Bring my glasses and my student health card.",
  };
  db.prepare(`INSERT INTO preparation_notes (id, user_id, appointment_id, main_concern, onset, background, experiences, questions, additional)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(newId(), uid, gp, notes.main_concern, notes.onset, notes.background, notes.experiences, notes.questions, notes.additional);
  const sections: ViewSections = {
    reason: [point("Headaches most afternoons and tiredness despite sleeping 8 hours", "main_concern", "I keep getting headaches most afternoons and I feel tired even after sleeping 8 hours")],
    timeline: [
      point("Started about three weeks ago, around the start of exams", "onset", "Started about three weeks ago, around when semester exams began"),
      point("Worse after long laptop study sessions; better on weekends", "experiences", "Headaches are worse after long study sessions on my laptop. Better on weekends"),
      point("Coffee helps a little", "experiences", "Coffee helps a little"),
    ],
    background: [
      point("Wears glasses for reading", "background", "I wear glasses for reading"),
      point("Iron was a bit low when checked last year", "background", "I had my iron checked last year and it was a bit low"),
    ],
    questions: [
      point("Could my screen time be causing the headaches?", "questions", "Could my screen time be causing the headaches?"),
      point("Could this be related to my iron?", "questions", "Could this be related to my iron?"),
      point("Should I get my eyes tested again?", "questions", "Should I get my eyes tested again?"),
    ],
    notes: [point("Bring glasses and student health card", "additional", "Bring my glasses and my student health card")],
  };
  saveBrief(gp, uid, sections, 0, "confirmed");

  const text = "Blood test (FBC and iron studies) within 5 days at any pathology collection centre.\nBook a review appointment with me in 2 weeks to go through results.\nTake iron supplement 1 tablet daily with food.\nStand up slowly and drink more water.\nCall the clinic soon if the dizziness gets worse.";
  const instr = newId();
  db.prepare("INSERT INTO visit_instructions (id, user_id, appointment_id, raw_text) VALUES (?,?,?,?)").run(instr, uid, past, text);
  // Categories and daily date ranges are explicit so the follow-through tracker looks lived-in straight away.
  const task = db.prepare(`INSERT INTO follow_up_tasks (id, user_id, appointment_id, instruction_id, title, source_text, deadline, status, needs_clarification, clarification_reason,
                             category, duration_days, start_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const med = "Medication wording is shown exactly as entered. Confirm any details with your healthcare professional or pharmacist.";
  const blood = newId(), review = newId(), iron = newId(), water = newId();
  const today = sydneyToday();
  task.run(blood, uid, past, instr, "Get blood test (FBC and iron studies)", "Blood test (FBC and iron studies) within 5 days at any pathology collection centre.", "within 5 days", "todo", 0, null, "follow_up", null, null);
  task.run(review, uid, past, instr, "Book a review appointment", "Book a review appointment with me in 2 weeks to go through results.", "in 2 weeks", "completed", 0, null, "follow_up", null, null);
  task.run(iron, uid, past, instr, "Take iron supplement 1 tablet daily with food.", "Take iron supplement 1 tablet daily with food.", null, "in_progress", 1, med, "daily", 14, addDays(today, -5));
  task.run(water, uid, past, instr, "Stand up slowly and drink more water", "Stand up slowly and drink more water.", null, "in_progress", 0, null, "daily", 7, addDays(today, -2));
  task.run(newId(), uid, past, instr, "Call the clinic if dizziness gets worse", "Call the clinic soon if the dizziness gets worse.", null, "todo", 1, "\"Soon\" is unclear. Confirm with the clinic when you should call.", "urgent", null, null);
  // A few days already ticked; today's iron dose is left for the visitor to tick (which completes today's set).
  const tick = db.prepare("INSERT INTO task_day_ticks (task_id, user_id, day) VALUES (?,?,?)");
  for (const d of [-5, -4, -2, -1]) tick.run(iron, uid, addDays(today, d));
  for (const d of [-2, -1, 0]) tick.run(water, uid, addDays(today, d));
  seedCircle(uid, { blood, review }, lockedHash);
  // In-app notifications Alex hasn't read yet (the bell shows them on first load; the overdue blood test adds one more).
  const note = db.prepare("INSERT INTO notifications (id, user_id, kind, message, link, created_at, read_at) VALUES (?,?,?,?,?,?,?)");
  note.run(newId(), uid, "task_completed", "Mia completed ‘Book a review appointment’", `/app/appointments/${past}#follow-up`, ago(49), ago(48));
  note.run(newId(), uid, "task_taken", "Mia took on ‘Get blood test (FBC and iron studies)’", `/app/appointments/${past}#follow-up`, ago(3), null);
  note.run(newId(), uid, "brief_viewed", "Dr Priya Lee viewed your brief", `/app/appointments/${gp}`, ago(1), null);
  return { gp, past, dental };
}

const ago = (hours: number) => new Date(Date.now() - hours * 3600_000).toISOString();

/** Companion demo people (purged with the visitor): a sister who helps Alex, and a grandfather Alex helps. */
function seedCircle(uid: string, tasks: { blood: string; review: string }, lockedHash: string) {
  const user = db.prepare("INSERT INTO users (id, email, name, password_hash) VALUES (?,?,?,?)");
  const tag = randomBytes(5).toString("hex");
  const mia = newId(), joe = newId();
  user.run(mia, `mia-${tag}@${DEMO_DOMAIN}`, "Mia (sister)", lockedHash);
  user.run(joe, `joe-${tag}@${DEMO_DOMAIN}`, "Grandpa Joe", lockedHash);
  const member = db.prepare("INSERT INTO care_members (id, owner_id, member_id, role, created_at) VALUES (?,?,?,?,?)");
  const log = db.prepare("INSERT INTO care_activity (id, owner_id, actor_id, kind, task_id, message, created_at) VALUES (?,?,?,?,?,?,?)");

  // Mia helps Alex: she booked the review and has taken on the blood test.
  member.run(newId(), uid, mia, "helper", ago(72));
  db.prepare("UPDATE follow_up_tasks SET assignee_user_id = ? WHERE id IN (?, ?)").run(mia, tasks.blood, tasks.review);
  log.run(newId(), uid, mia, "member_joined", null, "joined the care circle as a helper", ago(72));
  log.run(newId(), uid, mia, "task_taken", tasks.review, "took on “Book a review appointment”", ago(50));
  log.run(newId(), uid, mia, "task_completed", tasks.review, "marked “Book a review appointment” done", ago(49));
  log.run(newId(), uid, mia, "task_taken", tasks.blood, "took on “Get blood test (FBC and iron studies)”", ago(3));

  // Alex helps Grandpa Joe, so "People I support" has a real example.
  member.run(newId(), joe, uid, "helper", ago(200));
  const appt = db.prepare("INSERT INTO appointments (id, user_id, starts_at, practitioner_name, service_type, clinic_name, location, purpose) VALUES (?,?,?,?,?,?,?,?)");
  const cardio = newId(), joePast = newId();
  appt.run(cardio, joe, at(6, 9, 30), "Dr Helen Park", "Cardiologist", "Northside Heart Clinic (fictional)", "3 Demo Ave, Chatswood NSW 2067", "Blood pressure review");
  appt.run(joePast, joe, at(-10, 11, 0), "Dr Priya Lee", "General Practitioner (GP)", "Harbourside Family Practice (fictional)", null, "Check-up");
  saveBrief(cardio, joe, {
    reason: [{ id: newId(), text: "Blood pressure readings higher in the mornings", edited: false, user: true, field: null, quote: null }],
    timeline: [], background: [],
    questions: [
      { id: newId(), text: "Should I keep taking readings every morning?", edited: false, user: true, field: null, quote: null },
      { id: newId(), text: "Is it safe to keep walking every day?", edited: false, user: true, field: null, quote: null },
    ],
    notes: [{ id: newId(), text: "Bring the blood pressure diary", edited: false, user: true, field: null, quote: null }],
  }, 0, "confirmed");
  const jt = db.prepare("INSERT INTO follow_up_tasks (id, user_id, appointment_id, title, source_text, deadline, status) VALUES (?,?,?,?,?,?,?)");
  const lift = newId();
  jt.run(lift, joe, joePast, "Arrange a lift to the cardiology appointment", "Added manually", null, "todo");
  jt.run(newId(), joe, joePast, "Pick up blood pressure monitor from pharmacy", "Added manually", null, "completed");
  log.run(newId(), joe, uid, "member_joined", null, "joined the care circle as a helper", ago(200));
}

/** Removes expired demo accounts (cascades to everything they own). */
// Presenter account for timed demos: the log-in form starts filled with it (web/src/lib/demo-fill.ts).
// Fictional and data-free; set PRESENTER_ACCOUNT=off to skip it.
export const PRESENTER = { email: "branda@example.com", password: "12345678", name: "Brenda Example" };
export async function ensurePresenterAccount() {
  if (process.env.PRESENTER_ACCOUNT === "off") return;
  if (!db.prepare("SELECT 1 FROM users WHERE email = ?").get(PRESENTER.email)) {
    db.prepare("INSERT OR IGNORE INTO users (id, email, name, password_hash) VALUES (?,?,?,?)").run(newId(), PRESENTER.email, PRESENTER.name, await hashPassword(PRESENTER.password));
  }
  const { id } = db.prepare("SELECT id FROM users WHERE email = ?").get(PRESENTER.email) as { id: string };
  if (!db.prepare("SELECT 1 FROM follow_up_tasks WHERE user_id = ? LIMIT 1").get(id)) seedPresenterTasks(id);
}

/**
 * The presenter's follow-up tracker: a GP visit about headaches ten days ago, the instructions from it, and tasks
 * in every state (daily with ticks, overdue, due soon, done, a flagged medicine and an urgent warning sign).
 */
const PRESENTER_VISIT = { practitioner: "Dr Ava Example", purpose: "I have a headache and feel unsure what to do" };

/** Puts the presenter's headache visit back as seeded (ticks, completions and edits undone). Bookings are kept. */
export function resetPresenterTasks(uid: string) {
  db.exec("BEGIN");
  try {
    db.prepare(`DELETE FROM appointments WHERE user_id = ? AND practitioner_name = ? AND purpose = ? AND starts_at < ?
                AND EXISTS (SELECT 1 FROM visit_instructions vi WHERE vi.appointment_id = appointments.id)`)
      .run(uid, PRESENTER_VISIT.practitioner, PRESENTER_VISIT.purpose, new Date().toISOString());
    db.prepare("DELETE FROM notifications WHERE user_id = ? AND kind = 'task_overdue'").run(uid);
    seedPresenterTasks(uid);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}

export function seedPresenterTasks(uid: string) {
  const visit = newId(), instr = newId(), today = sydneyToday();
  db.prepare(`INSERT INTO appointments (id, user_id, starts_at, practitioner_name, service_type, clinic_name, location, purpose) VALUES (?,?,?,?,?,?,?,?)`)
    .run(visit, uid, at(-10, 10, 0), PRESENTER_VISIT.practitioner, "General practitioner (GP)", "Riverbend Family Practice (Demo)", "12 Example Rd, Macquarie Park NSW", PRESENTER_VISIT.purpose);
  const lines = {
    diary: "Keep a headache diary every day for 2 weeks: when each headache starts, how long it lasts, screen time, sleep, and what you ate or drank.",
    water: "Drink about 2 litres of water a day and take a 5-minute screen break every hour.",
    meds: "Paracetamol 500 mg, 2 tablets up to 4 times a day if needed for headache. No more than 8 tablets in 24 hours.",
    blood: "Blood test (full blood count) within 1 week at any pathology collection centre.",
    eyes: "Get your eyes tested at an optometrist within 2 weeks.",
    review: "Book a review appointment with me in 3 weeks to go through the diary and results.",
    warning: "Call 000 or go to the emergency department straight away if you get a sudden severe headache, weakness, confusion or loss of vision.",
  };
  db.prepare("INSERT INTO visit_instructions (id, user_id, appointment_id, raw_text) VALUES (?,?,?,?)").run(instr, uid, visit, Object.values(lines).join("\n"));
  const task = db.prepare(`INSERT INTO follow_up_tasks (id, user_id, appointment_id, instruction_id, title, source_text, deadline, status, needs_clarification, clarification_reason,
                             category, duration_days, start_date, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const med = "Medication wording is shown exactly as entered. Confirm any details with your healthcare professional or pharmacist.";
  const diary = newId(), water = newId();
  task.run(diary, uid, visit, instr, "Keep a headache diary", lines.diary, null, "in_progress", 0, null, "daily", 14, addDays(today, -9), null);
  task.run(water, uid, visit, instr, "Drink 2 litres of water and take hourly screen breaks", lines.water, null, "in_progress", 0, null, "daily", 14, addDays(today, -9), null);
  task.run(newId(), uid, visit, instr, lines.meds, lines.meds, null, "todo", 1, med, "one_time", null, null, null);
  task.run(newId(), uid, visit, instr, "Get a blood test (full blood count)", lines.blood, "within 1 week", "todo", 0, null, "follow_up", null, null, null);
  task.run(newId(), uid, visit, instr, "Get your eyes tested at an optometrist", lines.eyes, "within 2 weeks", "completed", 0, null, "follow_up", null, null, "Booked and done at Northgate Optometry (Demo). New reading glasses ordered.");
  task.run(newId(), uid, visit, instr, "Book a review appointment in 3 weeks", lines.review, "in 3 weeks", "todo", 0, null, "follow_up", null, null, null);
  task.run(newId(), uid, visit, instr, "Know the warning signs: call 000 for a sudden severe headache", lines.warning, null, "todo", 0, null, "urgent", null, null, null);
  // Most past days ticked (one missed diary day); today is left for the presenter to tick live.
  const tick = db.prepare("INSERT INTO task_day_ticks (task_id, user_id, day) VALUES (?,?,?)");
  for (const d of [-9, -8, -7, -6, -4, -3, -2, -1]) tick.run(diary, uid, addDays(today, d));
  for (const d of [-9, -8, -7, -6, -5, -4, -3, -2, -1]) tick.run(water, uid, addDays(today, d));
}

export function purgeDemoAccounts() {
  const cutoff = new Date(Date.now() - DEMO_TTL_HOURS * 3600_000).toISOString();
  return db.prepare("DELETE FROM users WHERE email LIKE ? AND created_at < ?").run(`%@${DEMO_DOMAIN}`, cutoff).changes;
}

// Each page load as the presenter starts the demo fresh: the app calls this once when it boots (web/src/lib/app-context.tsx).
demoRouter.post("/presenter-reset", requireAuth, (req, res) => {
  if (req.user!.email !== PRESENTER.email) return res.status(403).json({ error: "Only the presenter account can be reset" });
  resetPresenterTasks(req.user!.id);
  res.json({ ok: true });
});

demoRouter.post("/", limiter, async (_req, res) => {
  const id = newId();
  const email = `visitor-${randomBytes(5).toString("hex")}@${DEMO_DOMAIN}`;
  db.prepare("INSERT INTO users (id, email, name, password_hash) VALUES (?,?,?,?)")
    .run(id, email, "Alex Morgan", await hashPassword(randomBytes(24).toString("hex")));
  // Companion accounts get a hash of a discarded random password, so nobody can sign in as them.
  seedDemo(id, await hashPassword(randomBytes(24).toString("hex")));
  const { token, expires } = createSession(id);
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", expires, path: "/" });
  res.status(201).json({ user: { id, email, name: "Alex Morgan" } });
});
