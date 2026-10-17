# CarePath AI

Better prepared. Better organised. Better care. An organisational and navigation tool for healthcare appointments — **not** a medical service. Demo use only: fictional data.

## Features
- **Appointments** — your own records of appointments (nothing is booked with providers).
- **CarePath AI Assistant** (dashboard + its own page) — conversational help preparing for appointments and describing what kind of service you need. Never diagnoses or recommends treatment; emergencies get fixed 000 guidance.
- **AI Preparation** — turn your own notes, or an assistant conversation, into an editable, source-linked brief. Drafts can exist before an appointment and be attached later.
- **Fit Finder** — find and compare healthcare services by practical needs (location, published hours, telehealth, accessibility, verified billing, language). Deterministic, explainable matching; "Not verified" is never treated as a match. Natural-language requests are turned into editable filters. **The provider directory is fictional demo data.**
- **Follow-Up Tracker** — turn clinician instructions into a reviewed checklist.

## Requirements
- Node 22.13+ (uses the built-in `node:sqlite`).
- For AI features: a Google Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). Copy `.env.example` to `.env` and set `GEMINI_API_KEY`. The key is read only by the server and `.env` is git-ignored.
- Without a key the app still starts and every non-AI feature works (accounts, appointments, notes, manual tasks, dashboard); AI generation returns a clear "not configured" error.

## Run

```
npm install
npm run build      # builds the React app into web/dist
npm start          # API + built UI on http://localhost:4000
npm test           # backend tests (in-memory DB, Gemini mocked: no key, no network, no cost)
npm run typecheck
npm run seed       # fictional demo account: demo@carepath.example / demo-password-1
npm run eval       # real-model safety eval on synthetic cases (needs GEMINI_API_KEY; ~9 billable requests)
npm run ui-smoke   # Edge/Playwright UI checks, desktop + mobile, light + dark (server must be running + seeded)
npm run ui-fitfinder # Fit Finder, comparison, saved searches and draft briefs in the browser (no AI calls)
npm run ui-ai-features # chat -> brief -> attach, assistant -> Fit Finder handoff, NL search (~8 Gemini calls)
npm run ui-assistant # dashboard AI Assistant in the browser with real AI (~5 Gemini calls; needs GEMINI_API_KEY)
npm run ui-journey # full MVP journey through the UI with real AI on a fresh account (needs GEMINI_API_KEY)
```
Dev mode: `npm run dev:server` and `npm run dev:web` (Vite on :5173 proxies `/api`). Config: see `.env.example`.

## Architecture
- **Frontend:** React + TypeScript + Vite, plain CSS design tokens (light/dark).
- **Backend:** Express 5 + TypeScript, zod validation on every input, helmet, rate-limited auth.
- **Database:** SQLite (Node built-in `node:sqlite`, WAL mode) at `DATABASE_PATH`. Full schema for all phases is created at startup.
- **Auth:** scrypt password hashes; random session tokens in an httpOnly cookie, only the SHA-256 of the token is stored. Sessions live in the DB, so API instances are stateless.
- **Authorisation:** every query filters on `user_id`; other users' records return 404.
- **AI:** Google Gemini (`@google/genai`, default model `gemini-3.8-flash`, override with `GEMINI_MODEL`) using JSON-schema structured output. Output is validated with zod, then checked server-side: brief points must quote the patient's own words, task sources must be verbatim, medication wording is preserved and flagged, prompt-injection text is ignored. Timeout, per-user rate limit and a bounded queue protect the service.
- **AI Assistant:** stateless chat (`POST /api/assistant/chat`); the conversation lives in browser memory only and is never stored. Gemini returns `{reply, intent}`; action buttons are chosen by the server from a fixed list and the user's own appointments. Emergency/self-harm messages get fixed 000/Lifeline wording without calling the model; replies containing diagnostic or dosing language are replaced. Separate hourly limit (`AI_CHAT_RATE_LIMIT_PER_HOUR`, default 60).

## Scalability: implemented vs proposed
Implemented: server-side persistence, per-user data isolation, composite indexes, pagination (appointments, tasks), stateless request handling, per-user AI rate limit, AI request timeout, bounded AI queue, auth rate limiting.
Proposed (not built, not load-tested): PostgreSQL, a durable AI job queue with workers, scaled inference, Redis for shared rate limits, load balancing. **No load testing has been performed.** Details: docs/ARCHITECTURE.md.

## Deployment
1. Provision a Node 22.13+ host with a persistent disk for `DATABASE_PATH` (SQLite).
2. Set environment variables: `NODE_ENV=production`, `PORT`, `DATABASE_PATH`, `GEMINI_API_KEY` (as a platform secret, never in the repo), optionally `GEMINI_MODEL` and the `AI_*` limits.
3. `npm ci && npm run build && npm start` — one process serves the API and the built UI. Serve over HTTPS (cookies are `Secure` in production).
4. No local model or GPU is required.

## Gemini quota
A free-tier Gemini key is limited to **20 requests per day per model**. That is enough for a few manual checks, not for a demo or multiple users. Use a billing-enabled project for anything beyond that. When the quota is exhausted the app says so ("daily usage limit reached") and every non-AI feature keeps working. Approximate cost per action: assistant message 1 request, brief from chat 2, brief from notes 1, task extraction 1, natural-language search 1.

## Privacy note
When a user generates a brief or extracts tasks, that text is sent to Google's Gemini API. Use fictional data only. Google's terms differ by tier: on the free tier, submitted content may be used to improve Google's products; on paid (billing-enabled) projects it is not used for that purpose. Use a paid project for anything beyond a demo, and review Google's current terms.

## Docs
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture, AI safety design, scalability (implemented vs proposed)
- [docs/DEMO.md](docs/DEMO.md) — 3-minute judges' demo script
