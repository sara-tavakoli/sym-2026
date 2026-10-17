# CarePath AI — 3-minute live demo + Q&A prep (all data fictional)

**Before you go on (5 min):** open the live link in a signed-out browser; click **Try the live demo** once to confirm it loads and run one **Generate brief** to confirm the AI key works. The Gemini key must be on a **billing-enabled** project: the free tier allows only 20 requests/day per model, not enough for judging. Have a second tab (or a phone) ready to open the clinician link. Keep `docs/EVIDENCE.md` and `docs/SCOPE.md` open for questions.

| Time | Do | Say |
|---|---|---|
| 0:00 | Landing → scroll to **Booking is solved** stats | "HotDoc made booking easy. But patients forget 40 to 80% of what they're told, and in one BMJ study only 4 of 35 GP patients raised everything they came for. Booking is solved; what happens around the appointment isn't." |
| 0:20 | **Try the live demo** → dashboard **Needs attention** | "Every judge gets a private sandbox. Alex's blood test is overdue, the dentist is tomorrow and not prepared, and two instructions are unclear. HotDoc reminds you to turn up; we make sure the follow-through happens." |
| 0:40 | Appointments → **Import booking confirmation** → **Sample email** → Fill in the form → Create | "No retyping: paste the confirmation you already got, or the calendar file. Every field shows where it came from." |
| 1:00 | Open the GP appointment (20 Oct) → show the confirmed brief, expand a **source quote** | "The AI organises the patient's own words. The server throws away any point it can't trace back to what they typed, and anything that sounds like a diagnosis." *(If time: Prepare → Generate on the new appointment to show live AI.)* |
| 1:25 | **Share with your clinician** → Create link → open it in the second tab | "During the consult, the GP opens this. No account needed, the link expires, the patient can revoke it." |
| 1:40 | As the GP: tick two questions → write "Blood test within 5 days. Book a review in 2 weeks. Take vitamin D 1000 IU daily. Call if headaches get worse." → **Send** | "The questions get answered, and the plan comes straight back to the patient." |
| 2:00 | Back as Alex: refresh → **New plan from clinician** → **Turn into checklist** → Extract → Confirm | "It becomes a checklist with due dates. Medication wording is kept word-for-word and flagged. Vague items say 'confirm with your clinician'." |
| 2:25 | **Care circle** → Mia has taken the blood test; activity feed → **People I support** → Grandpa Joe | "Three million Australians are unpaid carers. Mia can see what's coming and take tasks on, and Alex helps their grandfather the same way." |
| 2:45 | Close | "Before, during and after: one loop around every appointment. We load-tested it locally at about 3,000 requests a second; the first thing to break at scale is AI throughput, so we have a queue design and automatic Gemini-to-Claude failover. And it never diagnoses." |

**If AI is slow or down:** the error is clear and nothing is lost. Skip the live generation and show the pre-confirmed brief; extraction can be shown from the seeded past visit.

## Likely questions (short answers; details in docs/EVIDENCE.md)
- **"Isn't this just HotDoc plus a notes app?"** HotDoc ends at the booking. The clinician loop and the care circle are two-sided, multi-user flows HotDoc doesn't have.
- **"Doesn't Heidi already send patients a summary?"** Yes, Heidi's patient recap. We don't replace the scribe; we close the loop around it: the patient's brief goes in, the plan comes back as a checklist with owners and due dates. A scribe could post to the same endpoint.
- **"Won't preparation make consults longer?"** A 2008 BMJ systematic review (Kinnersley et al.) found preparing before a consult slightly increased question-asking with no significant change in consultation length.
- **"Is this a medical device? Is it safe?"** It organises the patient's own words and never diagnoses. Safety is enforced in code (traceability checks, medication verbatim, injection filtering), not just prompts. No clinical validation yet.
- **"What breaks first at 100x?"** AI throughput (bounded queue, then job workers + quota), then single-node SQLite (→ Postgres; queries are already parameterised and per-user), then in-memory rate limits (→ Redis). See docs/ARCHITECTURE.md.
- **"Evidence from real users?"** Cite the interview notes the team collected today (docs/EVIDENCE.md §5), plus the studies.
- **"Privacy?"** Fictional data only. Share and invite tokens are stored hashed; supporters never see private notes; account deletion removes everything. AI text goes to the provider only when the user asks.

## Alternative script: assistant + Fit Finder focus (Thevindu)

**Before judges arrive (local version)**
- `GEMINI_API_KEY` set in `.env` on a **billing-enabled** project (the free tier allows only 20 requests/day per model — not enough for a demo). The full demo uses ~8 Gemini requests.
- `npm run build && npm run seed && npm start`, then open http://localhost:4000 and log in as `demo@carepath.example` / `demo-password-1`.
- Do one test message in the assistant to confirm the key works.

| Time | Do | Say |
|---|---|---|
| 0:00 | Landing page | "HotDoc helps you *book*. CarePath helps before and after the appointment — and helps you find a service that fits your practical needs. It's an organiser, not an AI doctor." Point at the safety notice. |
| 0:20 | Dashboard → **CarePath AI Assistant** → click "I have an appointment coming up…" | "The assistant asks non-diagnostic questions." |
| 0:35 | Type: "GP visit. Trouble sleeping for about a month since exams; I wake up a lot. I want to ask if my study routine matters and whether to keep a sleep diary." → **Create a brief from this conversation** | "It only keeps exact excerpts of what I typed — every point links back to my own words. The conversation itself isn't stored." Show a **Source** quote. |
| 1:05 | **Attach** → New appointment… (fictional GP, any date) → Confirm brief → Printable brief | "Drafts can exist before an appointment and attach later." |
| 1:30 | Assistant: "I need a dentist around Sydney who offers Saturday appointments" | "Gemini reads my preferences; I can edit them before anything is searched." Remove/adjust a chip → **Find providers**. |
| 1:50 | Fit Finder results | "Results come from the database, not the AI. Each card explains why it's here: met, partly met, not met, and **not verified** — missing data is never treated as a match. Opening hours are published hours, not availability. Every provider here is fictional." |
| 2:15 | Tick two providers → **Compare side by side** | "Practical details only — no claims about clinical quality." |
| 2:30 | Assistant: "my flatmate has chest pain and can't breathe" | "Emergencies never reach the AI — fixed 000 guidance." |
| 2:45 | Refresh; show `docs/ARCHITECTURE.md` scalability section | "Implemented: isolation, indexes, pagination, rate limits, timeouts, deterministic matching. Proposed: Postgres, queued AI, paid quota. Not load-tested — we don't claim 10k." |

**If the AI is slow or the quota is hit:** the UI shows a clear message (including "daily usage limit reached") and nothing is lost. Fit Finder's structured filters, comparison, appointments and follow-up tracking all work without AI.
