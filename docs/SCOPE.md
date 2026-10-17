# Scope Honesty Declaration — CarePath AI

What a judge can click on the live link, and exactly how real each part is. All data is fictional.

## Works end to end (real code, real database, persists across sessions)
| Feature | Notes |
|---|---|
| Accounts and sessions | scrypt passwords, httpOnly session cookie, only token hashes stored. |
| **One-click demo** ("Try the live demo") | Creates a private sandbox account with fictional data; deleted after 24 h. Every judge gets their own, so nobody collides. |
| Appointments | Create, edit, delete, upcoming/past, pagination. |
| **Import from a booking confirmation** | Paste a confirmation email/SMS or upload an `.ics` file; fields are pre-filled with the exact source snippet shown. Nothing is saved until the user confirms. |
| **AI appointment brief** | Real generation (Google Gemini, with Claude as automatic fallback). The server keeps only points whose quote is found verbatim in the patient's notes; diagnostic/treatment wording the patient didn't use is dropped. Edit, confirm, print. |
| **Clinician share link** | Expiring, revocable link (token stored hashed). The clinician sees the brief with no account, ticks questions as addressed, and sends back an after-visit plan. View time and count are shown to the patient. |
| **After-visit checklist** | The clinician's plan (or pasted instructions) → AI task extraction → patient reviews → saved. Medication wording kept verbatim and flagged; vague items flagged for clarification; deadlines only if written. |
| **Needs attention** | Due dates resolved from "within 5 days", "in 2 weeks", etc.; overdue, due-soon, unclear tasks, and unprepared visits within 72 h. "Draft a message to the clinic" builds an editable message from the task's own wording (no AI). |
| **Care circle** | Invite a family member/carer as viewer or helper; helpers take ownership of and complete tasks; activity feed; removal revokes access immediately. |
| AI assistant | Stateless chat for navigating the app; never stored. Emergency wording is fixed (000 / Lifeline) and bypasses the model. |

## Partial: please read before asking
- **HotDoc import is not an integration.** HotDoc has no public API. We parse the confirmation text or calendar file the patient already receives. The parser is built for typical Australian formats and tested on our own fictional samples, **not on real HotDoc emails**.
- **"Heidi-style" clinician loop has no Heidi integration.** The clinician types or pastes the plan. In production, a scribe like Heidi could post its approved patient summary to the same endpoint. Heidi already gives patients a recap; what's new here is the loop: patient brief in → plan out → checklist with owners.
- **No email/SMS sending.** Share links and care-circle invites are copied and sent by the patient; the UI says so. Nudges are in-app only (no push notifications).
- **AI needs a provider key on the server.** Without one, every non-AI flow still works and AI buttons show a clear "not configured" message.
- **Fit Finder** (compare clinics by access needs and billing): backend and fictional directory exist; the page is still being built by a teammate.

## Not built / simulated
- No real patient data, no real clinics or practitioners (all fictional).
- Not a medical device; no clinical validation; never diagnoses or recommends treatment.
- Scalability numbers come from **one local load test** (see docs/ARCHITECTURE.md), not a production load test.
- Single SQLite database on one hosted instance; the Postgres + job-queue path is designed, not built.
