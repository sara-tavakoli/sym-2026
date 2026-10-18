# CarePath AI

Better prepared. Better organised. Better care. An organisational and navigation tool for healthcare appointments — **not** a medical service. Demo use only: fictional data.

## Features
- **Book care** — "Do you know what care you need?" **No:** *Help me find care* (describe the concern in your own words, a few follow-up questions, a summary of what you said, a suggested pathway such as a GP). **Yes:** search clinics directly. Then choose a clinic and a time, sign in or sign up only at that point, complete a patient profile once, review and confirm. The appointment lands on the dashboard with a reference. **Clinics are fictional and no real clinic is contacted**; times are generated from published opening hours and a time can be booked once.
- **Appointments** — demo bookings plus your own records of appointments booked elsewhere (add manually or import a confirmation).
- **CarePath AI Assistant** (dashboard + its own page) — conversational help preparing for appointments and describing what kind of service you need. Never diagnoses or recommends treatment; emergencies get fixed 000 guidance.
- **AI Preparation** — turn your own notes, or an assistant conversation, into an editable, source-linked brief. Drafts can exist before an appointment and be attached later.
- **Fit Finder** — find and compare healthcare services by practical needs (location, published hours, telehealth, accessibility, verified billing, language). Deterministic, explainable matching; "Not verified" is never treated as a match. Natural-language requests are turned into editable filters. **The provider directory is fictional demo data.**
- **Follow-Up Tracker** — turn clinician instructions into a reviewed checklist.

**One loop around every appointment** booked on HotDoc:
1. **Before:** import the booking confirmation, then turn your own notes into a one-page brief where every point is traced to what you wrote.
2. **During:** choose whether to share the brief. Share it with your clinician through an expiring link (they tick off your questions and send back the after-visit plan), or keep it for yourself.
3. **After:** the plan becomes a checklist with due dates; overdue and unclear items are surfaced, with a ready-to-send message to the clinic.
4. **Together:** invite a family member or carer as a viewer or helper who can take ownership of tasks.

Try it: **Try the live demo** on the homepage creates a private sandbox account with fictional data (deleted after 24 h).

## Requirements
- Node 22.13+ (uses the built-in `node:sqlite`).
- For AI features: any of `GROQ_API_KEY` (used in production: `openai/gpt-oss-120b`, then `openai/gpt-oss-20b`), `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` in `.env` (git-ignored). Configured providers are tried in order; `AI_PROVIDER` moves one to the front. **Without any key, briefs, task extraction and consult drafting use a labelled rules-based fallback, and the assistant uses a keyword guide**, so every flow still works.

## Run

```
npm install
npm run build      # builds the React app into web/dist
npm start          # API + built UI on http://localhost:4000
npm test           # backend tests (in-memory DB, Gemini mocked: no key, no network, no cost)
npm run typecheck
npm run seed       # fictional demo account: demo@carepath.example / demo-password-1
npm run eval       # real-model safety eval on synthetic cases (needs an AI key; 35/35 pass on Groq gpt-oss-120b)
npm run e2e        # Playwright judge journey: patient, clinician and carer in separate browsers (BASE=<url>)
npm run ui-audit   # screenshots ~31 pages at desktop light + phone dark; flags overflow, console errors, unnamed controls
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
- **AI:** provider-agnostic client (Groq, Gemini, Claude) with JSON-schema structured output, zod validation and one retry; providers fall through on rate limits/outages, then to deterministic rules. Output is checked server-side: brief points must quote the patient's own words, task sources must be verbatim, medication wording is preserved and flagged, prompt-injection text is ignored, consult instructions must be traceable to the transcript.
- **AI Assistant:** stateless chat (`POST /api/assistant/chat`); the conversation lives in browser memory only and is never stored. Gemini returns `{reply, intent}`; action buttons are chosen by the server from a fixed list and the user's own appointments. Emergency/self-harm messages get fixed 000/Lifeline wording without calling the model; replies containing diagnostic or dosing language are replaced. Separate hourly limit (`AI_CHAT_RATE_LIMIT_PER_HOUR`, default 60).

## Scalability: implemented vs proposed
Implemented: server-side persistence, per-user data isolation, composite indexes, pagination (appointments, tasks), stateless request handling, per-user AI rate limit, AI request timeout, bounded AI queue, Gemini → Claude provider failover, auth and public-link rate limiting.
Measured locally (one run, 50 concurrent connections): ~3,000 dashboard reads/s and ~4,900 appointment writes/s with zero errors. What breaks first at 100x is AI throughput, then single-node SQLite, then in-memory rate limits. Proposed fixes (not built): durable AI job queue with workers, PostgreSQL, Redis. Details: docs/ARCHITECTURE.md.

## Deployment
Deployed on Railway from the `Dockerfile` (one container serves the API and the built UI):
1. Attach a persistent volume at `/data` (the image sets `DATABASE_PATH=/data/carepath.db`, `NODE_ENV=production`, `TRUST_PROXY=1`).
2. Set secrets in the platform, never in the repo: `GROQ_API_KEY` (production) and optionally `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`. `DEMO_RATE_LIMIT_PER_HOUR` (production: 300) controls one-click demo accounts per IP. Optional: `GEMINI_MODEL`, `CLAUDE_MODEL`, the `AI_*` limits.
3. Serve over HTTPS (cookies are `Secure` in production). No local model or GPU is required.

## AI quota
The Groq free tier allows about 8,000 tokens per minute per model. The app uses two models and then falls back to labelled rules, so a busy demo degrades gracefully instead of failing.

## Privacy note
When a user generates a brief, extracts tasks, drafts consult notes or chats with the assistant, that text is sent to the configured AI provider (Groq in production). Use fictional data only. Google's terms differ by tier: on the free tier, submitted content may be used to improve Google's products; on paid (billing-enabled) projects it is not used for that purpose. Use a paid project for anything beyond a demo, and review Google's current terms.

## Docs
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architecture, AI safety design, scalability (implemented vs proposed)
- [docs/DEMO.md](docs/DEMO.md) — 3-minute judges' demo script and Q&A
- [docs/SCOPE.md](docs/SCOPE.md) — scope honesty declaration: what works, what's partial, what's simulated
- [docs/EVIDENCE.md](docs/EVIDENCE.md) — researched problem evidence with citations
