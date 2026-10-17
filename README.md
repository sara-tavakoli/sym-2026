# CarePath AI

Better prepared. Better organised. Better care. An organisational tool for medical appointments — **not** a medical service. Demo use only: fictional data.

**One loop around every appointment** booked on HotDoc:
1. **Before:** import the booking confirmation, then turn your own notes into a one-page brief where every point is traced to what you wrote.
2. **During:** share the brief with your clinician through an expiring link; they tick off your questions and send back the after-visit plan.
3. **After:** the plan becomes a checklist with due dates; overdue and unclear items are surfaced, with a ready-to-send message to the clinic.
4. **Together:** invite a family member or carer as a viewer or helper who can take ownership of tasks.

Try it: **Try the live demo** on the homepage creates a private sandbox account with fictional data (deleted after 24 h).

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
Implemented: server-side persistence, per-user data isolation, composite indexes, pagination (appointments, tasks), stateless request handling, per-user AI rate limit, AI request timeout, bounded AI queue, Gemini → Claude provider failover, auth and public-link rate limiting.
Measured locally (one run, 50 concurrent connections): ~3,000 dashboard reads/s and ~4,900 appointment writes/s with zero errors. What breaks first at 100x is AI throughput, then single-node SQLite, then in-memory rate limits. Proposed fixes (not built): durable AI job queue with workers, PostgreSQL, Redis. Details: docs/ARCHITECTURE.md.

## Deployment
Deployed on Railway from the `Dockerfile` (one container serves the API and the built UI):
1. Attach a persistent volume at `/data` (the image sets `DATABASE_PATH=/data/carepath.db`, `NODE_ENV=production`, `TRUST_PROXY=1`).
2. Set secrets in the platform, never in the repo: `GEMINI_API_KEY` and/or `ANTHROPIC_API_KEY` (with both, Claude is the automatic fallback; `AI_PROVIDER=claude` makes it primary). Optional: `GEMINI_MODEL`, `CLAUDE_MODEL`, the `AI_*` limits.
3. Serve over HTTPS (cookies are `Secure` in production). No local model or GPU is required.

## Privacy note
When a user generates a brief or extracts tasks, that text is sent to Google's Gemini API. Use fictional data only. Google's terms differ by tier: on the free tier, submitted content may be used to improve Google's products; on paid (billing-enabled) projects it is not used for that purpose. Use a paid project for anything beyond a demo, and review Google's current terms.

## Docs
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture, AI safety design, scalability (implemented vs proposed)
- [docs/DEMO.md](docs/DEMO.md) — 3-minute judges' demo script and Q&A
- [docs/SCOPE.md](docs/SCOPE.md) — scope honesty declaration: what works, what's partial, what's simulated
- [docs/EVIDENCE.md](docs/EVIDENCE.md) — researched problem evidence with citations
