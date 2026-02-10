# Promptly MVP Progress

## Overall Status

- MVP implementation is largely complete for local/dev usage.
- Core app, API, auth (Google/GitHub/Discord), preview flow, scheduler data model, and Go worker are implemented.
- Docker Compose-based local deployment path is implemented.

## Completed

- App scaffold: Next.js App Router + TypeScript + Tailwind
- Database: Prisma schema + initial migration for `users`, `jobs`, `run_histories`, `preview_events`
- Auth: NextAuth social login (Google, GitHub, Discord)
- Job management APIs:
  - `GET /api/jobs`
  - `POST /api/jobs`
  - `PUT /api/jobs/:id`
  - `DELETE /api/jobs/:id`
- Preview APIs:
  - `POST /api/preview`
  - `POST /api/jobs/:id/preview`
- Run history API:
  - `GET /api/jobs/:id/histories`
- Job Editor UI sections implemented:
  - Name, Prompt, Web Search option, Preview, Schedule, Channel, Save/Delete
- Schedule UX updates:
  - Weekly day-of-week selector (human-readable)
  - Cron input with live readable description
- Channel delivery:
  - Discord webhook send
  - Telegram `sendMessage`
  - message chunking
- Service response policy:
  - goal-centric system prompt applied
  - non-chat, direct final-output style enforced for preview and worker runs
- Security and policy:
  - channel credential encryption/masking
  - daily run limit checks
  - preview counted in daily limits
- Worker (Go):
  - poll loop (10s)
  - `FOR UPDATE SKIP LOCKED`
  - LLM call with optional web search
  - success/failure updates and auto-disable after 10 failures
  - run history writes
- Docker artifacts:
  - `Dockerfile` (web)
  - `worker/Dockerfile`
  - `docker-compose.yml` (db/web/worker)
- **UI/UX Polish (2026-02-10)**:
  - Global "Notion-like" styling (flat shadows, sharp inputs, compact minimal buttons).
  - Navbar: simplified text-link auth navigation (Sign in/out), redundant button-style auth controls removed.
  - Dashboard: "Create Job" button added to header.
  - New Job Page: "Back" link removed, "Use example" enhanced with Clear button.
  - Sign Out: Dedicated `/signout` route implementation.
  - Edit Job Page: top-level back link removed for cleaner editor flow.
- **Copy Management Refactor (2026-02-11)**:
  - Centralized UI descriptions and CTA/button labels into `src/content/ui-text.ts`.
  - Landing, Dashboard, Help, Sign In, Navbar, and Job Editor now consume shared copy keys.
  - Reduces string duplication and makes future copy updates one-file changes.

## In Place and Verified

- Next.js production build passes (`npm run build`)
- Worker compiles (`go build ./...` in `worker/`)
- Local DB container starts and migrations apply
- Google OAuth callback works once DB is running
- Preview works for authenticated users, including optional test-send to selected channel

## Remaining to Call Production-Ready

- End-to-end production smoke test (scheduled run -> channel delivery -> history verification)
- Deployment hardening (real secrets, domain/TLS, OAuth production callback setup)
- Optional: additional tests (API integration/e2e) for regression safety
- Production runbook for backup/restore and on-call troubleshooting

## Notes

- Telegram **login** was removed per request; Telegram **delivery channel** remains supported.
- Preview supports optional channel test-send via checkbox in Job Editor.
