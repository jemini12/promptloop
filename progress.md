# Promptloop Progress

## Overall Status

- MVP implementation is largely complete for local/dev usage.
- Core app, API, auth (Google/GitHub/Discord), preview flow, scheduler data model, and serverless scheduled runner are implemented.

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
- non-chat, direct final-output style enforced for preview and scheduled runs
- Security and policy:
  - channel credential encryption/masking
  - daily run limit checks
  - preview counted in daily limits
- Worker (Vercel Functions + Cron):
  - cron-triggered job runner
  - row locking (`FOR UPDATE SKIP LOCKED`)
  - LLM call with optional web search
  - success/failure updates and auto-disable after 10 failures
  - run history writes
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
- **Control Standardization (2026-02-11)**:
  - Added reusable `Button` and `LinkButton` components with shared tokens via `src/components/ui/control-styles.ts`.
  - Refactored landing/help/dashboard CTAs to `LinkButton` and interactive actions (signin/job editor) to `Button`.
  - Enforced equal size/typography between link/button controls for the same variant and size.
  - Added drift guard: `scripts/check-ui-controls.sh` and `npm run check:ui-controls`.

- **DB/Auth Stabilization (2026-02-16)**:
  - Prisma Accelerate + direct Postgres configuration clarified and documented.
  - Prisma datasource mapping aligned to Vercel-style env vars:
    - `PRISMA_DATABASE_URL`: Prisma Accelerate URL (runtime; must start with `prisma://` or `prisma+postgres://`)
    - `DATABASE_URL`: direct Postgres URL (Prisma migrate/introspect)
  - Fixed `.env` parsing pitfall: ensure each env var is on its own line (a missing newline can break `DATABASE_URL`).
  - Prisma enum type names mapped to DB enum types via `@@map(...)` to avoid type mismatch errors.
  - After env/schema changes, regenerating Prisma Client and restarting dev server unblocks NextAuth callbacks.

- **Worker Reliability Baseline (Phase 0, 2026-02-16)**:
  - Scheduled run idempotency (dedupe by job + scheduled time) to prevent duplicate sends.
  - Delivery attempt receipts persisted (`delivery_attempts`) for retry observability.
  - Scheduled runs enforce the same daily run limit behavior as previews.
  - Runner correlation id stored on `run_histories.runner_id`.

- **Prompt Lifecycle v1 (Phase 1, 2026-02-16)**:
  - Prompt templates + Variables (JSON) with `{{var}}` substitution and built-ins (date/time/now_iso/timezone).
  - Immutable `prompt_versions` table and `jobs.published_prompt_version_id` publish pointer.
  - Scheduled runs and previews bind to a specific PromptVersion (`run_histories.prompt_version_id`).
  - Preview UI supports “run as scheduled” (timestamp/timezone).

- **Artifacts + Output Contracts v1 (Phase 2, 2026-02-17)**:
  - Persist run artifacts on `run_histories`: `llm_model`, `llm_usage`, `llm_tool_calls`, `used_web_search`, `citations`.
  - Web search citations are extracted from Responses API annotations (`url_citation`).
  - Channel delivery appends up to 5 Sources when citations exist.
  - Webhook default payload is a stable JSON object with `title`, `body`, `content`, `usedWebSearch`, `citations`, and `meta`.
  - Job History UI shows web-search runs and Sources links.

- **Evals + Governance (Phase 3, 2026-02-17)**:
  - Audit log table (`audit_logs`) added; API writes audit entries for job create/update/delete and prompt publish.
  - Eval suite/case/run tables added (`eval_suites`, `eval_cases`, `eval_runs`) with API endpoints to create suites and execute eval runs for a specific PromptVersion.

## In Place and Verified

- Next.js production build passes (`npm run build`)
- Scheduled runner builds as part of Next.js production build
- Local DB is available and migrations apply
- Google OAuth callback works once DB is running
- Preview works for authenticated users, including optional test-send to selected channel

## Local Testing Notes (2026-02-17)

- Dev server restart: `npm run dev` boots cleanly.
- HTTP smoke checks (logged out): `/`, `/help`, `/signin` return 200; protected APIs return 401.
- Unit-style checks: prompt template rendering built-ins and webhook default payload/meta shaping.
- Known dev-only noise: if you have stale `next-auth.*` cookies after secret/env changes, you may see `JWT_SESSION_ERROR` until cookies are cleared.

Dev auth troubleshooting notes (common):

- `next-auth` `JWT_SESSION_ERROR` (JWE decryption failed) is typically stale cookies after a secret/env change.
  - Fix: clear `next-auth.*` cookies for localhost and keep `NEXTAUTH_SECRET` stable.
- Prisma datasource URL validation errors are almost always env var mismatch or malformed `.env` (e.g., missing newline).

## Remaining to Call Production-Ready

- End-to-end production smoke test (scheduled run -> channel delivery -> history verification)
- Deployment hardening (real secrets, domain/TLS, OAuth production callback setup)
- Optional: additional tests (API integration/e2e) for regression safety
- Production runbook for backup/restore and on-call troubleshooting

## Notes

- Telegram **login** was removed per request; Telegram **delivery channel** remains supported.
- Preview supports optional channel test-send via checkbox in Job Editor.
