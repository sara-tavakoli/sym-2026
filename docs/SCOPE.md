# Scope Honesty Declaration — CarePath AI

What a judge can click on the live link (https://carepath-production-7912.up.railway.app), and exactly how real each part is. All data is fictional.

## Works end to end (real code, real database, persists across sessions and redeploys)
| Feature | Notes |
|---|---|
| Accounts and sessions | scrypt passwords, httpOnly session cookie, only token hashes stored. |
| **One-click demo** ("Try the live demo") | Creates a private sandbox account with fictional data (deleted after 24 h), so judges never collide. A floating **Demo guide** checklist walks the 3-minute journey and ticks itself off. |
| **Book care** (public until confirm) | "Do you know what care you need?" → *Help me find care* (concern in own words → follow-up questions → summary → suggested pathway) or *search clinics directly* → choose a clinic and a 30-minute time → sign in / sign up (the time is kept in the URL) → patient profile (date of birth, phone, optional emergency contact) if missing → review → confirm. Creates an appointment with a `CP-` reference; the reason for visit pre-fills preparation. A unique index means each time can be booked once. **Times are generated from the fictional clinic's published hours; no real clinic is contacted or booked.** |
| **Share or keep the brief** | On each appointment the patient answers "Share with my clinician?" Yes reveals the share link; No records the brief as private (the journey shows "Kept private") and can be changed later. |
| Appointments + **import a booking confirmation** | Paste a confirmation email/SMS or upload an `.ics` file; fields are pre-filled and each shows its source snippet. Nothing is saved until the user confirms. |
| **AI appointment brief** | Real generation (Groq `gpt-oss-120b`, then `gpt-oss-20b`; Gemini or Claude if their keys are set). The server keeps only points whose quote is found verbatim in the patient's notes and drops diagnostic wording the patient didn't use. Edit, confirm, print. |
| **Clinician consult workspace** (Heidi-style) | Patient shares an expiring, revocable link (token stored hashed). The clinician sees the brief with no account, ticks questions, loads a (fictional) consult transcript, gets **drafted notes + patient instructions**, edits them, ticks each instruction, and **approves & releases**. Server-enforced: 422 unless every instruction is ticked, locked (409) after approval. Before/After diff of the clinician's edits, plain-language summary, and an **audit timeline** both sides can see. |
| **After-visit checklist** | The released plan (or pasted instructions) becomes reviewable tasks: medication wording kept verbatim and flagged, vague items flagged, deadlines only if written. Tasks are categorised **urgent / daily / follow-up / one-time** (patient can change it). |
| **Care calendar** | Daily tasks get a start/end date and a day strip to tick (future days refused); the task completes when every day is ticked. |
| **Needs attention + notifications** | Due dates resolved from "within 5 days", "in 2 weeks"…; overdue, due-soon, unclear tasks and unprepared visits within 72 h. "Draft a message to the clinic" builds an editable message from the task's own words (no AI). An in-app **notification bell** reports clinician views, released plans, helper actions and overdue tasks. |
| **Care circle** | Invite family or a carer as viewer or helper; helpers take ownership of and complete tasks; activity feed; removal revokes access immediately. |
| **Help me find care** ("Not sure where to start?") | Public 4-step questionnaire (concern + follow-up questions) → summary of the answers → rule-based, non-diagnostic suggestion of a *kind* of service with the reason quoted from the user's words → public clinic search pre-filled. Red-flag wording shows a 000 / Lifeline banner first. The follow-up questions and the suggestion are keyword rules, not AI. |
| **Fit Finder** | Search is public (`/search`); saved searches, compare and AI request reading need an account. Compare (fictional) clinics by location, days, telehealth, accessibility, bulk billing and language; every result explains why it matches and flags unverified details; compare 2–3; saved searches; add to appointments. |
| **AI assistant (navigation only)** | Helps people find the right feature and guides them there with buttons. Declines technical, general-knowledge and medical questions (fixed wording, before any model call). Emergency wording is fixed (000 / Lifeline) and bypasses the model. Conversations are never stored. |

## AI resilience: what happens without (or beyond) an AI key
- The Groq free tier allows ~8,000 tokens/minute per model. When both models are busy or no key is set, **briefs, task extraction and consult drafting fall back to deterministic rules** that only reorganise the user's own sentences, pass the same verification, and are labelled "Drafted by rules". The assistant falls back to a keyword guide.

## Partial: please read before asking
- **HotDoc import is not an integration.** HotDoc has no public API. We parse the confirmation text or calendar file the patient already receives; tested on our own fictional samples, **not on real HotDoc emails**.
- **No Heidi integration.** The consult workspace is our own; the transcript is a fictional sample or pasted text. A scribe like Heidi could post its approved notes to the same endpoint. Heidi already gives patients a recap; what's new is the loop around it: patient brief in → approved plan out → checklist with owners and due dates.
- **The clinician is whoever holds the link.** There's no clinician login; the approver's name is typed, not verified.
- **No email/SMS/push.** Share links and invites are copied and sent by the patient; notifications are in-app only.

## Not built / simulated
- No real patient data, clinics or practitioners. Not a medical device; no clinical validation; never diagnoses or recommends treatment.
- Scalability numbers come from **one local load test** (docs/ARCHITECTURE.md), not a production load test.
- Single SQLite database on one hosted instance; the Postgres + job-queue path is designed, not built.
