# CarePath AI — 3-minute judges' demo (all data fictional)

**Prep (before judges arrive):** `GEMINI_API_KEY` set in `.env`; `npm run build && npm run seed && npm start`; run one test generation to confirm the key and quota work. Open http://localhost:4000, log in as `demo@carepath.example` / `demo-password-1` (or register fresh).

| Time | Do | Say |
|---|---|---|
| 0:00 | Landing page → **Prepare for an Appointment** | "HotDoc helps you *book*. CarePath helps with everything either side of the appointment. It's an organiser — not an AI doctor." Point at the disclaimer / Healthdirect / 000. |
| 0:25 | Dashboard → **New appointment** (fictional GP, 3 days away) | "Records are user-managed — we don't pretend to book." |
| 0:45 | Open it → **Prepare** → paste: *Concern:* "I keep getting headaches in the afternoon" · *Started:* "about three weeks ago" · *Noticed:* "Worse after long study sessions" · *Questions:* "Could my screen time matter? Should I get my eyes checked?" → **Generate** | While it runs (a few seconds): "This is real generation with Google Gemini using structured output — and the server re-checks every point against what the patient typed." |
| 1:15 | Show the brief: expand a point's **Source** quote. Edit one point, delete one, **Confirm** | "Every point links to the patient's own words; the server rejects anything it can't trace. Nothing is final until I confirm." |
| 1:50 | **Printable brief** → Print / Save as PDF | "One page to take into the room." |
| 2:00 | Open the seeded *past* physio appointment → paste: "Book a review in 2 weeks. Take ibuprofen 400mg as discussed. Call the clinic soon." → **Extract** | "Medication is shown verbatim and flagged; vague items say 'confirm with your clinician'; deadlines only if stated." |
| 2:30 | **Confirm** tasks → tick one complete → **refresh the page** | "Everything is in the database; survives restarts and new sessions." |
| 2:45 | Show `docs/ARCHITECTURE.md` scalability table | "Implemented: isolation, indexes, pagination, rate limits, timeouts. Proposed: Postgres + queued AI workers. We haven't load-tested and don't claim 10k." |

**If the AI is slow/unavailable:** the UI shows a clear error and nothing is lost; retry. Keep a pre-generated brief on the demo account as a fallback.
