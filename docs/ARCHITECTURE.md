# CarePath AI — Architecture & Scalability

## Overview
```
Browser (React SPA) ──HTTPS──▶ Express API (stateless) ──▶ SQLite (WAL)
                                   │
                                   └──▶ AI client ──▶ Google Gemini API (primary)
                                                  └─▶ Anthropic Claude API (automatic fallback)
```
Hosted on Railway: one Docker container, SQLite on a persistent volume at `/data`.
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

### Measured (18 Oct 2026, local load test)
`autocannon`, 50 concurrent connections for 10 s, one authenticated user with 40 appointments, single Node process + SQLite (WAL) on a laptop (Apple Silicon). Not repeated on the hosted instance, which has less CPU, so treat these as upper bounds.

| Endpoint | Throughput | Latency p50 / p97.5 | Errors |
|---|---|---|---|
| `GET /api/dashboard` (5 indexed queries) | ~3,000 req/s | 14 ms / 43 ms | 0 |
| `POST /api/appointments` (write + read back) | ~4,900 req/s | 8 ms / 28 ms | 0 |
| AI brief generation | bounded by `AI_MAX_CONCURRENT=4` per instance, ~3–10 s per call | — | queue sheds load with 503 at 20 waiting |

### What breaks first at 100x users? (in order)
1. **AI generation throughput and cost.** Four concurrent calls of a few seconds each is roughly 0.5–1 generation/s per instance. At 100x, peak demand exceeds that and the bounded queue starts returning "busy" (by design, so it doesn't fall over). **Fix:** durable job queue (BullMQ/SQS) + worker pool, async UI (job id + polling), provider quota increase. Gemini → Claude fallback is already built, so one provider's outage or rate limit doesn't stop the app.
2. **Single-node SQLite.** Reads and writes are fast (above), but the database lives on one volume: no horizontal scaling, no failover. **Fix:** PostgreSQL (managed, e.g. Neon/RDS) with a pool; the SQL is standard and every query is already parameterised and scoped by `user_id`, so the port is mechanical. Then several stateless API instances behind a load balancer (sessions are already in the DB).
3. **In-memory rate limits and AI queue.** They are per process, so with several instances limits become per instance. **Fix:** Redis-backed limiter and queue.
4. **Public share links** (clinician view) are read-heavy and unauthenticated. **Fix:** rate limits (built) plus CDN-cached static assets; the data itself is never cached.

**Honest status:** the numbers above come from one local run, not a production load test, and we make no claim about concurrent-user capacity on the hosted instance.

## Privacy
Synthetic data only for the hackathon. Minimal storage; account deletion removes all user data. Cookies are httpOnly/SameSite=Lax (Secure in production); passwords use scrypt; only session-token hashes are stored. Health text is sent to the Gemini API only when a user requests generation; raw AI responses are not stored. The API key is server-side only. On Gemini's free tier, Google may use submitted content to improve its products — use a billing-enabled project beyond the demo.
