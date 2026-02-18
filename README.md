# Promptloop

Prompt scheduler that executes `gpt-5-mini` on daily/weekly/cron and sends output to Discord or Telegram.

## Stack

- Next.js App Router + TypeScript + Tailwind
- PostgreSQL + Prisma
- NextAuth social auth (Google/GitHub/Discord)
- Vercel AI SDK (AI Gateway provider; model ids like `openai/gpt-5-mini`)
- Vercel Functions (Fluid Compute) + Vercel Cron Jobs for scheduled execution

## Environment Variables

Copy `.env.example` to `.env`.

Required values:

- `PRISMA_DATABASE_URL` (Prisma Accelerate URL; used at runtime)
- `DATABASE_URL` (direct Postgres URL; used for Prisma migrate/introspect)
- `AI_GATEWAY_API_KEY` (or Vercel OIDC in deployments)
- `NEXTAUTH_SECRET`
- OAuth keys:
  - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
  - `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
  - `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`
- `CHANNEL_SECRET_KEY` (recommended; if omitted, `NEXTAUTH_SECRET` is used)
- Optional: `DAILY_RUN_LIMIT`

## Local Run

```bash
npm install
npm run prisma:generate
npm run dev
```

Smoke test (requires dev server running):

```bash
npm run smoke
```

Apply DB schema:

```bash
npx prisma migrate deploy
```

## Worker

### Vercel worker (Fluid + Cron)

- Route: `GET /api/cron/run-jobs` (implemented at `src/app/api/cron/run-jobs/route.ts`)
- Cron config: `vercel.json` runs it every minute
- Security: set `CRON_SECRET` in Vercel env; Vercel will send `Authorization: Bearer $CRON_SECRET`

Tuning env vars:

- `WORKER_MAX_JOBS_PER_RUN` (default: 25)
- `WORKER_TIME_BUDGET_MS` (default: 250000)
- `WORKER_DELIVERY_MAX_RETRIES` (default: 3)
- `WORKER_LOCK_STALE_MINUTES` (default: 10)

Local test:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/run-jobs
```

## Response Policy

- LLM calls use a service-level system prompt for goal-centric output.
- Responses are generated as non-chat final deliverables (plain text, no conversational filler).

## Main Routes

- `/` dashboard
- `/chat` job builder (chat)
- `/jobs/new` job editor
- `/jobs/[id]/edit` job editor (update/delete)
- `/jobs/[id]/history` run history
- `/signin` social sign-in page

Prompt Writer (enhance) is available inside the Job Editor prompt section.

## API

- `GET /api/jobs`
- `POST /api/jobs`
- `PUT /api/jobs/:id`
- `DELETE /api/jobs/:id`
- `POST /api/jobs/:id/preview`
- `POST /api/preview`
- `GET /api/jobs/:id/histories`

Chat:

- `POST /api/chat` (SSE stream)
- `GET /api/chat/history?chatId=...`

Prompt Writer:

- `POST /api/prompt-writer/enhance`

## Chat Persistence (optional)

The `/chat` flow can persist chat history to the database.

Apply the migration locally:

```bash
npx prisma migrate dev
```

Docs: `docs/job-builder-chat.md`
