# VisitReady — SPEC

AI-assisted healthcare journey demo (fictional). Two fictional personas, each with one visit doc in Mongo `visits`: alex → `visit-alex-001` (cough → GP, Dr Sarah Lin) and priya → `visit-priya-001` (changing mole → Skin Check, Dr Marcus Vance at Carlton Family Medical). Every /api/visit* and /api/demo/transcript endpoint takes `?persona=alex|priya` (default alex, 404 if unknown). GET /api/personas lists them with demo answers. Frontend keeps the active persona in localStorage (`visitready-persona`, lib/persona.ts `vurl()`), with a header persona switcher.

## Roles
No login. Header toggle: Patient (→ /journey) / Clinician (→ /clinician). "Reset demo" (header) → POST /api/visit/reset clears the visit.

## Flows / pages
- `/` home: direct search (→ /clinics?q=) or guided (→ /navigate). Service chips → /clinics?service=id.
- `/navigate`: 4-step questionnaire (concern, duration, consulted before + referral, location + preference + consent_reuse). "Fill Alex's demo answers" button. POST /api/visit/questionnaire → rule-based pathway (lib/demo_data.suggest_pathway; red-flag words → emergency banner). Not a diagnosis.
- `/clinics`: fictional clinics (static, slots for next 3 days from server today). POST /api/visit/booking {clinic_id, slot_id, service_id}.
- `/prep`: requires booking. Form prefilled from questionnaire only if consent_reuse. POST /api/visit/brief/generate {prep, use_fallback} → GPT-5.2 (emergent key) or fallback; each point has source_field + source_text. PUT /api/visit/brief {points, shared} → status saved. Clinician sees brief only if shared && saved.
- Clinician portal: `/clinician` = C00 welcome ("Continue as Dr Sarah Lin (Demo)" sets localStorage `visitready-clinician`; no password). `/clinician/dashboard` = C01 (GET /api/clinician/dashboard → today (Melbourne date), clinician, an appointment row for every persona, whoever they booked with: booking, brief_shared, consult_status; grouped Today / Upcoming / Not booked yet; "Open Consultation"). `/clinician/consult/:persona` = C02 workspace (the URL sets the active persona) + C03 confirmation panel once approved (status, approved_by = Dr Sarah Lin, number released). Dashboard and consult redirect to the welcome page when signed out. Header: Sign out.
- Slots: today's remaining standard times plus two near-term slots (next half-hours, Australia/Melbourne), then the next 2 days.
- Consult workspace: load sample transcript (GET /api/demo/transcript), POST /api/visit/consult/generate → status draft. PUT /api/visit/consult (edits, draft only). POST /api/visit/consult/approve {notes, instructions, reviewed:true} → approved, locked, tasks created (status suggested) from instructions verbatim.
- `/actions`: locked until approved. Confirm suggested tasks (POST /api/visit/tasks/confirm) → todo. PATCH /api/visit/tasks/{id} {status: todo|in_progress|completed} (409 if still suggested).
- `/journey`: dashboard of 4 stages.
- `/brief/print`: print-styled brief (window.print). GET /api/visit/brief/pdf?persona= → reportlab PDF download (lib/brief_pdf.py).
- Clinician approval: each Instruction has `approved` bool; the clinician ticks each item (editing an item unticks it). Approve & release returns 422 unless every item is approved. Consult keeps `ai_notes` / `ai_instructions` (untouched AI draft) → "Before / After" word-diff tab (components/BeforeAfter.tsx). `edited` = final differs from the AI draft.
- Demo guide: a floating "Demo guide" button (bottom-right) opens a Sheet with a 9-step checklist that ticks itself off from visit state, with Go links.

## Business rules enforced server-side
409 for: brief without booking, notes without booking, edits after approval, confirming tasks before approval, status change on unconfirmed task. 422 approve unless all instructions are approved.

## AI
lib/ai.py — OpenAI gpt-5.2 via emergentintegrations, JSON parsed from streamed text; any failure → labelled fallback (`ai_source: "fallback"`).

## Separate areas, notifications, follow-through (latest)
- Routes: patient area `/patient/*` (/patient, /patient/navigate, /patient/clinics, /patient/prep, /patient/follow-through, /patient/journey, /patient/brief/print); clinician area `/clinician/*`. `/` → /patient. Each area has its own header and a NotificationBell; the top strip has a "Demo: switch to Clinician/Patient" link (no role toggle).
- Notifications (Mongo `notifications`, routers/notifications.py): GET /api/notifications?audience=patient&persona=alex | audience=clinician (all personas); POST /api/notifications/read-all?audience=..; POST /api/notifications/{id}/read. Created on: booking → clinician; brief shared → clinician; approval → patient ("Dr Sarah Lin released your treatment plan", link /patient/follow-through); tasks accepted → clinician. The bell polls every 4s. Reset clears that persona's notifications.
- Audit timeline: Visit.events [{actor patient|clinician|ai|system, actor_name, type, message, at}], logged by every journey endpoint; shown on the consult page and follow-through page.
- On approve: lib/tasks.classify → GPT-5.2 (only when the notes were a live AI draft) or keyword rules fallback → each Task gets category one_time|daily|follow_up|urgent, duration_days, due_in_days; Consult.patient_summary (plain language), classified_by ai|rules.
- Accept (tasks/confirm): daily start_date = today (Melbourne), end_date = start + duration - 1; follow_up due_date = consult (approval) date + due_in_days.
- POST /api/visit/tasks/{id}/day {date, done} ticks one day of a daily task (422 for future or out-of-range days; completed once all days are ticked). Visit.today = server Melbourne date.
- GET /api/visit/summary/pdf → patient visit summary PDF (404 until approved).
- Colours: urgent red, daily green, follow-up blue, one-time amber (types.ts CATEGORY_META). Motivational quote (static list, by date) when all daily tasks for a day are ticked.
- Clinician dashboard filters: All / Brief shared / Awaiting approval (client-side); the dashboard refetches every 5s.

## Homepage + nav (latest)
- /patient homepage: headline, then a large photo banner with two frosted pathway cards: "Book the care you need" (service search + chips → /patient/clinics) and "Not sure? Tell us how you feel" (symptom input + examples "I have a fever" / "I have a sore throat" → /patient/navigate?concern=… which pre-fills Q1 and opens Q2). Below: JourneyShowcase (4 auto-advancing tabs with animated live previews, pause on hover) and Testimonials (horizontal scroll-snap carousel of fictional users).
- Patient nav: Home + "My journey" dropdown (Journey overview, then 1 Find care, 2 Prepare, 3 Follow-through). Footer removed; the thin top DEMO strip carries the fictional / 000 notice.

## UI update (latest)
- Patient header: no signed-in look. Shows "Sign in" / "Sign up" (demo toasts only) and no notification bell. Persona switching moved to the DEMO strip ("Demo persona: Alex ▾", testid persona-switcher-btn). Clinician area keeps its bell after "Continue as Dr Sarah Lin".
- Home JourneyShowcase is an accordion: each step's simple preview + "Try" link opens directly under that step's progress line.
- Inner pages (Navigate/Prep/Follow-through/Journey/Clinics) use a frosted PageHeader band over the hero photo and `frost-card` utility cards.
- Sign in / Sign up open `/patient/sign-in` (demo): pick Alex or Priya → sets persona → /patient. Link to clinician portal.
- Home symptom box shows live "Might suit" service chips matched from `Service.keywords` (served by /api/services); guidance only.
- Demo strip keeps a prominent red "In an emergency call 000" pill (tel link). Showcase has no "Try …" links.

## Guest vs signed-in patient (latest)
- Nobody is signed in by default (localStorage `visitready-signed-in`). Guests: useVisit is disabled on /patient/* → Prepare shows an empty, disabled form + empty brief; Follow-through shows every section (consultation, summary, checklist legend, calendar, timeline) empty.
- Find care (home "Not sure? Tell us how you feel" or menu) → questionnaire step 1 "Not sure? Tell us how you feel" (Start) → 4 questions → guest suggestion via stateless POST /api/pathway/suggest (kept in localStorage `visitready-guest`).
- Guest picks clinic time → "Sign in to book this time" → /patient/sign-in?next=book. Choosing Alex/Priya: POST /visit/reset (fresh empty journey EVERY sign-in), then carries over questionnaire + booking → lands on /patient/prep. Sign up = same picker, fresh journey.
- Signed-in header: notification bell + avatar menu with Sign out. "Fill X's demo answers/details" buttons appear only when signed in.
- Patient stepper is 3 steps (Find care → Prepare → Follow-through); Consult only in clinician area. GET /api/today gives server date for empty calendar.

## Accounts & booking (latest — supersedes the guest/sign-in notes above)
- Real patient accounts: email+password (bcrypt, httpOnly `session_token` cookie, 7d) or Emergent Google; `/api/auth/{signup,login,logout,me,profile,google/session,forgot,reset}`. Forgot password sends a real email via Emergent-managed Resend (link → /patient/reset-password?token=, 1h, single use).
- Profile (required: full name, DOB, mobile; optional preferred name, gender). Only missing fields are asked.
- Account visit = persona `<user_id>` (visit id `visit-<user_id>`); patient endpoints are owner-only (404 otherwise). Clinician demo endpoints (/clinician/visit, consult generate/update/approve, transcript) can open any account visit; dashboard lists demo personas + every account with a booking. Account consults reuse Alex's (GP) or Priya's (Skin Check) fictional transcript.
- Demo mode ("Continue as Alex Turner / Priya Sharma (Demo)") is separate, fictional, resets the journey.
- Booking: /patient/book (also /patient/clinics) steps Clinic → Doctor → Date & time → Sign in → Profile → Review → Confirmed; selection kept in URL params (clinic, doctor, date, slot, service, step). Appointment created only on "Confirm booking"; repeated confirm for same slot is idempotent. Appointment ID = booking.reference shown in confirmation, My Journey and clinician dashboard.
- Known limitation: clinician portal is a no-login demo, so it can view account visits.

## Location-based clinic search (latest)
- Every in-person fictional clinic has real lat/lng (3 Melbourne + 9 Sydney: Macquarie Park, North Ryde, Epping, Chatswood, St Leonards, Sydney CBD, Surry Hills, Bondi Junction, Parramatta). Telehealth clinic: online=true, no coordinates.
- GET /api/clinics/nearby?location=&radius_km=(5|10|20|50) → geocodes via OpenStreetMap Nominatim (countrycodes=au, 1 req/s, cached in Mongo `geocode_cache`; optional Google fallback if GOOGLE_MAPS_API_KEY set) → haversine straight-line distance, filtered by radius, sorted nearest; online clinics listed separately. 404 if not found, 503 if lookup unavailable, 422 bad radius.
- Book clinic step: location box (URL param loc), radius chips (radius, default 10), service/type/availability filters, name filter; empty state offers "Expand search to N km". Only the typed place name is sent — no browser geolocation.
