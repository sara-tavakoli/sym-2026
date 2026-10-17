# CarePath AI

Better prepared. Better organised. Better care. An organisational tool for medical appointments — **not** a medical service. Demo use only: fictional data.

## Run

```
npm install
npm run build      # builds the React app into web/dist
npm start          # API + built UI on http://localhost:4000
npm test           # backend API tests (in-memory DB)
npm run typecheck
```
Dev mode: `npm run dev:server` and `npm run dev:web` (Vite on :5173 proxies `/api`). Config: see `.env.example`.

## Architecture
- **Frontend:** React + TypeScript + Vite, plain CSS design tokens (light/dark).
- **Backend:** Express 5 + TypeScript, zod validation on every input, helmet, rate-limited auth.
- **Database:** SQLite (Node built-in `node:sqlite`, WAL mode) at `DATABASE_PATH`. Full schema for all phases is created at startup.
- **Auth:** scrypt password hashes; random session tokens in an httpOnly cookie, only the SHA-256 of the token is stored. Sessions live in the DB, so API instances are stateless.
- **Authorisation:** every query filters on `user_id`; other users' records return 404.

## Scalability: implemented vs proposed
Implemented: server-side persistence, per-user data isolation, composite indexes `(user_id, starts_at)` etc., paginated appointment history, stateless request handling, auth rate limiting.
Proposed (not built, not load-tested): move SQLite to PostgreSQL, move AI generation to a job queue with workers, per-user AI rate limits and timeouts (Phase 2), horizontal API scaling behind a load balancer, shared rate-limit store. **No load testing has been performed.**
