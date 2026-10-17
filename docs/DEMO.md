# CarePath AI — 3-minute judges' demo (all data fictional)

**Before judges arrive**
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
