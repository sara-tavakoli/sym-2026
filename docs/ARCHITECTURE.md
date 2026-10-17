# CarePath AI — Architecture & Scalability

## Overview
```
Browser (React SPA) ──HTTPS──▶ Express API (stateless) ──▶ SQLite (WAL)
                                   │
                                   └──▶ AI client ──▶ Google Gemini API (@google/genai, gemini-3.8-flash)
```
One deployable: the API also serves the built SPA. The only third party that receives health text is the Gemini API, and only when the user asks for generation.

## Data model (SQLite)
`users` · `sessions` · `appointments` · `preparation_notes` · `appointment_briefs` · `brief_source_refs` · `visit_instructions` · `follow_up_tasks`.
Every child table carries `user_id` and every query filters on it. Deleting a user or appointment cascades. Indexes: `appointments(user_id, starts_at)`, `follow_up_tasks(user_id, status)`, `follow_up_tasks(appointment_id)`, `sessions(user_id)`, `brief_source_refs(brief_id)`.

## AI safety design (enforced in code, not only in prompts)
1. **Structured output**: Gemini is called with `responseMimeType: application/json` and a `responseJsonSchema`; the result is validated with zod; one retry on malformed output. SDK errors map to clean statuses (429 busy, 503 not configured/unavailable, 502 bad output, 504 timeout).
2. **Traceability**: every brief point must carry a `field` and an exact `quote`. The server checks the quote exists in that field of the patient's input, that the field is permitted for that section, and drops anything else (the UI tells the user how many points were removed). Surviving links are stored in `brief_source_refs`. Clients can never set links — on edit they are re-read from the database by point id.
3. **No clinical interpretation**: points that introduce diagnostic/treatment words the patient didn't use are dropped.
4. **Tasks**: `source_text` must be a verbatim substring of the pasted instructions; deadlines are kept only if they appear in the text *and* are an explicit date/timeframe; medication statements are forced verbatim (title = source) and always flagged for clarification; vague phrasing ("as discussed", "soon") is flagged by a deterministic rule even if the model misses it.
5. **Prompt injection**: sentences that try to instruct the AI are detected and nothing may be derived from them.
6. **Human in the loop**: briefs are drafts until confirmed (any later edit returns them to draft); extracted tasks are not stored until the user reviews and confirms them. Raw AI conversations are never stored — only the user's notes, the confirmed brief, and confirmed tasks.

## Scalability — implemented vs proposed
**Implemented**
- Server-side persistence and per-user isolation, enforced on the backend (tested).
- Composite indexes; pagination on appointment history and tasks (max page size 50).
- Stateless API: sessions live in the DB, so any instance can serve any request.
- AI protection: per-user hourly rate limit, request timeout (60 s, aborts the SDK request), bounded in-process queue with concurrency limit (caps spend per instance), clean 429/503/504 errors.
- Login/registration rate limiting.

**Proposed (NOT built, NOT measured)**
- Replace SQLite with PostgreSQL (the SQL is portable; `node:sqlite` calls are isolated in route files) with a connection pool and read replicas.
- Move AI generation to a durable job queue (e.g. BullMQ/SQS) with worker processes; the API returns a job id and the UI polls or subscribes. Today a request holds an HTTP connection for up to a minute, which is the first thing that would not scale.
- Request a higher Gemini quota / provisioned throughput as usage grows, behind the queue; cache nothing health-related.
- Shared rate-limit and session cache (Redis); multiple API instances behind a load balancer.
- Observability: structured logs, metrics for AI latency/queue depth/drop rates.

**Honest status:** no load testing has been performed. We make no claim about concurrent-user capacity. AI throughput is bounded by the Gemini project's quota and by `AI_MAX_CONCURRENT` per instance; the queue and rate limits protect the rest of the app and the budget. Supporting 10,000 users would mean the proposed queue, a higher quota, and a load test to confirm.

## Privacy
Synthetic data only for the hackathon. Minimal storage; account deletion removes all user data. Cookies are httpOnly/SameSite=Lax (Secure in production); passwords use scrypt; only session-token hashes are stored. Health text is sent to the Gemini API only when a user requests generation; raw AI responses are not stored. The API key is server-side only. On Gemini's free tier, Google may use submitted content to improve its products — use a billing-enabled project beyond the demo.
