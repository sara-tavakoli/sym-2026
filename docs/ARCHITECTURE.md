# CarePath AI — Architecture & Scalability

## Overview
```
Browser (React SPA) ──HTTPS──▶ Express API (stateless) ──▶ SQLite (WAL)
                                   │                          ├─ user records (appointments, briefs, drafts, tasks, saved searches)
                                   │                          └─ provider directory (fictional demo data)
                                   ├──▶ Fit Finder matching (deterministic, no AI)
                                   └──▶ AI client ──▶ Google Gemini API (@google/genai, gemini-3.8-flash)
```
One deployable: the API also serves the built SPA. The only third party that receives health text is the Gemini API, and only when the user asks for generation or sends an assistant message.

**Division of labour:** Gemini only interprets language (organising the user's words, reading search preferences). The server verifies every AI output, owns all links and actions, and does all provider filtering, ranking and comparison from stored data.

## Data model (SQLite)
User data (every table carries `user_id`; every query filters on it; deletes cascade):
`users` · `sessions` · `appointments` · `preparation_notes` · `appointment_briefs` · `brief_source_refs` · `draft_briefs` · `visit_instructions` · `follow_up_tasks` · `saved_searches`.

Provider directory (shared, read-only for users):
`service_categories` · `locations` · `clinics` · `providers` · `provider_attributes` (language / telehealth / gender) · `clinic_hours` (published hours) · `clinic_billing` · `clinic_accessibility` · `booking_links`.
Every directory attribute row has a `source` and a nullable `verified_at`; clinics have `data_source`, `source_ref` and `is_fictional`. **NULL `verified_at` means "not verified" and is never treated as a match.**

Indexes: `appointments(user_id, starts_at)`, `follow_up_tasks(user_id, status)`, `follow_up_tasks(appointment_id)`, `draft_briefs(user_id, updated_at)`, `saved_searches(user_id, created_at)`, `providers(category_id, clinic_id)`, `clinics(lat, lng)`, `clinic_hours(clinic_id, day)`, `locations(suburb)`, `locations(postcode)`, `sessions(user_id)`, `brief_source_refs(brief_id)`.

## Features and where the logic lives
| Feature | AI role | Deterministic server role |
|---|---|---|
| Assistant chat (`/api/assistant/chat`) | One call returns `{reply, intent, preferences}` | Emergency/self-harm screen before the model (fixed 000/Lifeline wording); diagnostic/dosing replies replaced; action buttons chosen from a fixed list + the user's own appointments; preferences verified against the user's words. Conversation is never stored. |
| Brief from chat (`/api/drafts/from-chat`) | (1) pick verbatim excerpts from the user's messages; (2) organise them into a brief | Each excerpt must exist in the message it cites; each brief point must quote its field. Only the excerpts are saved, never the conversation. |
| Draft briefs (`/api/drafts`) | Same brief generator | Ownership checks; attach copies notes + brief + source links onto an owned appointment in one transaction. |
| Appointment brief / follow-up tasks | As before | As before (see AI safety below). |
| Fit Finder search (`/api/fit-finder/search`) | none | Category + bounding-box prefilter (indexed), exact distance, per-preference status, transparent ranking, pagination. |
| Natural-language search (`/api/fit-finder/extract` and assistant) | Propose `{field, value, quote}` items | Quote must be in the text **and** contain words that express that preference (e.g. "Saturday", "bulk bill"); service type only from explicit service words, never from symptoms. |
| Compare (`/api/fit-finder/compare`) | none | Same evaluation for 2–3 providers. |

### Fit Finder matching
- Hard filters: service category; distance radius for in-person searches (telehealth searches are not distance-limited).
- Each preference gets a status from stored attributes: **met**, **partial** (e.g. bulk billing for *some* patients), **not met** (verified negative), or **not verified** (missing or unverified data).
- Ranking: most preferences met → most partly met → fewest not met → nearest → name. The UI states this rule and shows "Meets X of Y" counts — no percentages.
- "Only show providers that meet every preference" removes providers with a *not met* preference; unverified ones stay (and are labelled).
- Opening hours are always labelled as published hours, not appointment availability. No booking slots, fees or eligibility are ever generated.
- Directory access goes through the `ProviderDirectory` interface (`server/src/providers/directory.ts`); a verified external provider API can be added as another implementation without touching matching or the UI.

### Demo provider data
`server/src/providers/demo-data.ts` seeds 17 clearly fictional clinics / 22 practitioners in real Sydney suburbs (approximate coordinates). Names end in "(Demo)"/use placeholder surnames, booking links point to `example.com`, and some attributes are deliberately unverified or missing so "Not verified" behaviour is visible. Every result card is labelled "Fictional demo". No data was scraped or copied from HotDoc or any other service.

## AI safety design (enforced in code, not only in prompts)
1. **Structured output** with `responseJsonSchema`, zod validation, one retry. `thinkingLevel: LOW` (configurable) and `maxOutputTokens` bound latency and runaway output. SDK errors map to clean statuses (429 busy / daily limit reached, 503 not configured, 502 bad output, 504 timeout).
2. **Traceability**: brief points must quote the user's own words; excerpts from chat must quote the exact message; task sources must be verbatim; search preferences must quote the request. Untraceable output is dropped and the user is told.
3. **No clinical interpretation**: brief points with diagnostic/treatment words the user didn't use are dropped; assistant replies with diagnostic or dosing language are replaced with a safe fallback; service type is never inferred from symptoms.
4. **Emergencies**: deterministic keyword screen before any model call; model-flagged emergencies also get fixed wording; Call 000 (and Lifeline for self-harm) actions.
5. **Prompt injection**: sentences that try to instruct the AI are detected and nothing may be derived from them.
6. **Human in the loop**: briefs are drafts until confirmed; extracted tasks and search preferences are shown for review before anything is saved or searched.

## Scalability — implemented vs proposed
**Implemented**
- Server-side persistence and per-user isolation, enforced on the backend (tested for appointments, briefs, drafts, tasks and saved searches).
- Indexes for every common query, including provider search (category + geo bounding box).
- Pagination: appointments, tasks, Fit Finder results (max 20 per page), saved searches capped per user.
- Stateless API (sessions in the DB); provider matching is separate from AI inference.
- Directory attributes loaded per batch (one query per table, no N+1).
- AI protection: per-user hourly limits (generation 20/h, chat 60/h), 60 s timeout that aborts the SDK request, bounded in-process queue with a concurrency cap, output-token cap, one call per assistant turn.

**Proposed (NOT built, NOT measured)**
- PostgreSQL (+PostGIS for distance) with a connection pool and read replicas; the provider directory is read-heavy and cacheable.
- A durable AI job queue (BullMQ/SQS) with workers; the API returns a job id. Today a request holds an HTTP connection for up to a minute — the first thing that would not scale.
- A paid Gemini tier / provisioned throughput behind the queue. **The current key is on the free tier, limited to 20 requests per day per model** — far below even a single live demo's needs.
- Redis for shared rate limits and directory caching; multiple API instances behind a load balancer.
- A verified provider data feed (e.g. a licensed directory API) via the `ProviderDirectory` interface, with scheduled re-verification.
- Observability: structured logs; metrics for AI latency, drop rates and queue depth.

**Honest status:** no load testing has been performed and no claim is made about concurrent-user capacity. Supporting 10,000 users would need the proposed queue, a paid AI quota, PostgreSQL, and a load test to confirm.

## Privacy
Synthetic data only for the hackathon. Minimal storage: assistant conversations are not stored; briefs created from chat keep only the verified excerpts of the user's own words. Account deletion removes all user data. Cookies are httpOnly/SameSite=Lax (Secure in production); passwords use scrypt; only session-token hashes are stored. The API key is server-side only. On Gemini's free tier, Google may use submitted content to improve its products — use a billing-enabled project beyond the demo.
