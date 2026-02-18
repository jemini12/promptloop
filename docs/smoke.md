# Smoke Testing

This repo doesn't have a full automated test suite yet. Use the smoke harness for basic regression checks.

## Prerequisites

- Start the dev server:

```bash
npm run dev
```

## Signed-out smoke

```bash
npm run smoke
```

This verifies:

- Public pages render (`/`, `/signin`, `/help`)
- Protected routes show sign-in redirect markers (`/dashboard`, `/jobs/new`)
- Key APIs are auth-protected (401 when not signed in)
- Cron route requires auth header when `CRON_SECRET` is set

## AI Gateway smoke (provider-native web search)

This verifies that provider-native web search works across multiple providers via AI Gateway.

```bash
npm run smoke:ai-gateway
```

Required env:

- `AI_GATEWAY_API_KEY` (or `VERCEL_OIDC_TOKEN`)

Optional env:

- `AI_GATEWAY_SMOKE_SEARCH_MODELS` (comma-separated `provider/model` list)
- `AI_GATEWAY_SMOKE_SEARCH_PROMPTS` (newline-separated prompts; each must be answerable with citations)

## Signed-in smoke (manual)

1) Sign in via `/signin`.
2) Open `/chat` and send a message.
   - Verify streaming response renders.
   - Verify tool calls render output (e.g. `plan_from_intent`).
2) Create a job at `/jobs/new`.
3) In Job Options, set:
   - Model: `openai/gpt-5-mini`
   - Web search: OFF
4) Run Preview and confirm:
   - Output renders
   - `usedWebSearch=false`
5) Turn Web search ON (provider-native only), run Preview again.
6) Save job, then confirm run history at `/jobs/[id]/history` after a scheduled run or a cron trigger.

Optional: you can run the smoke script with an authenticated cookie:

```bash
SMOKE_COOKIE='next-auth.session-token=...' npm run smoke
```

Note: This only works if the cookie is valid for `SMOKE_BASE_URL`.
