import { Router } from "express";
import rateLimit from "express-rate-limit";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "../db.js";
import { newId, requireAuth } from "../auth.js";
import { directory } from "../providers/directory.js";
import { BOOKING_DAYS, SLOT_MINUTES, isOpenSlot, slotsFor } from "../booking/slots.js";
import { DEFAULT_TZ, zonedDate } from "../import/tz.js";

// Book a (fictional) clinic: choose a time → sign in if needed → complete the profile if needed → review → confirm.
// Browsing a clinic's times is public; the profile and the booking itself need an account.
export const bookingRouter = Router();
export const profileRouter = Router();
profileRouter.use(requireAuth);

const limiter = rateLimit({
  windowMs: 60_000, limit: Number(process.env.BOOKING_RATE_LIMIT_PER_MIN ?? 60), standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment and try again." },
});

export const NOTICE = "Demo booking: every clinic is fictional and no real clinic is contacted. Times are generated from the clinic's published opening hours.";

// ---------- Patient profile ----------
interface ProfileRow { date_of_birth: string; phone: string; emergency_name: string | null; emergency_phone: string | null; updated_at: string }
const loadProfile = (uid: string) =>
  (db.prepare("SELECT date_of_birth, phone, emergency_name, emergency_phone, updated_at FROM patient_profiles WHERE user_id = ?").get(uid) as ProfileRow | undefined) ?? null;

const phone = z.string().trim().regex(/^\+?[\d\s()-]{8,20}$/, "Enter a phone number, e.g. 0400 000 000");
const optional = (s: z.ZodString) => z.union([s, z.literal("")]).optional().nullable().transform((v) => (v ? v : null));
const profileBody = z.object({
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth").refine((d) => {
    const t = Date.parse(`${d}T00:00:00Z`);
    return !Number.isNaN(t) && d <= zonedDate(new Date(), DEFAULT_TZ) && d >= "1900-01-01";
  }, "Enter a real date of birth in the past"),
  phone,
  emergency_name: optional(z.string().trim().max(100)),
  emergency_phone: optional(phone),
});

profileRouter.get("/", (req, res) => {
  const profile = loadProfile(req.user!.id);
  res.json({ profile, complete: !!profile });
});

profileRouter.put("/", (req, res) => {
  const b = profileBody.parse(req.body);
  db.prepare(`INSERT INTO patient_profiles (user_id, date_of_birth, phone, emergency_name, emergency_phone) VALUES (?,?,?,?,?)
              ON CONFLICT(user_id) DO UPDATE SET date_of_birth=excluded.date_of_birth, phone=excluded.phone, emergency_name=excluded.emergency_name,
                emergency_phone=excluded.emergency_phone, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .run(req.user!.id, b.date_of_birth, b.phone, b.emergency_name, b.emergency_phone);
  res.json({ profile: loadProfile(req.user!.id), complete: true });
});

// ---------- Choosing a clinic and a time (public) ----------
bookingRouter.get("/providers/:id", limiter, (req, res) => {
  const [p] = directory.byIds([String(req.params.id).slice(0, 80)]);
  if (!p) return res.status(404).json({ error: "We couldn't find that clinic" });
  res.json({ provider: p, days: slotsFor(p), slot_minutes: SLOT_MINUTES, window_days: BOOKING_DAYS, tz: DEFAULT_TZ, notice: NOTICE });
});

// ---------- Confirming a booking ----------
const bookBody = z.object({
  provider_id: z.string().min(1).max(80),
  starts_at: z.string().datetime({ message: "Choose an appointment time" }),
  mode: z.enum(["in_person", "telehealth"]).default("in_person"),
  reason: z.string().trim().max(500).optional().nullable().transform((v) => (v ? v : null)),
});

const reference = () => `CP-${randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`;

bookingRouter.post("/", requireAuth, (req, res) => {
  const b = bookBody.parse(req.body);
  const uid = req.user!.id;
  const [p] = directory.byIds([b.provider_id]);
  if (!p) return res.status(404).json({ error: "We couldn't find that clinic" });
  if (b.mode === "telehealth" && !p.telehealth?.value) return res.status(400).json({ error: "This clinic doesn't list telehealth appointments" });
  if (!loadProfile(uid)) return res.status(422).json({ error: "Please complete your patient profile before booking", code: "profile_required" });
  const startsAt = new Date(b.starts_at).toISOString();
  if (!isOpenSlot(p, startsAt)) return res.status(409).json({ error: "That time is no longer available. Please choose another.", code: "slot_unavailable" });

  const apptId = newId(), ref = reference();
  const location = b.mode === "telehealth" ? "Telehealth (video or phone)" : p.clinic.address ?? `${p.clinic.suburb} ${p.clinic.state} ${p.clinic.postcode}`;
  db.exec("BEGIN");
  try {
    db.prepare(`INSERT INTO appointments (id, user_id, starts_at, practitioner_name, service_type, clinic_name, location, purpose) VALUES (?,?,?,?,?,?,?,?)`)
      .run(apptId, uid, startsAt, p.name, p.category.name, p.clinic.name, location, b.reason);
    db.prepare("INSERT INTO bookings (id, user_id, appointment_id, provider_id, starts_at, mode, reference) VALUES (?,?,?,?,?,?,?)")
      .run(newId(), uid, apptId, p.id, startsAt, b.mode, ref);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    // Two people confirming the same time at once: the unique slot index lets exactly one through.
    if (e instanceof Error && /UNIQUE constraint failed: bookings\.provider_id/.test(e.message)) {
      return res.status(409).json({ error: "That time was just booked by someone else. Please choose another.", code: "slot_unavailable" });
    }
    throw e;
  }
  res.status(201).json({ appointment_id: apptId, reference: ref, starts_at: startsAt, mode: b.mode });
});
