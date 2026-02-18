# AI Gateway Multi-Model + Web Search Plan

Goal: support multiple models through Vercel AI Gateway, while keeping web search fully user-controlled.

## Principles

- Web search is never forced. User must opt in per job (`useWebSearch=true`).
- When web search is enabled, never route/fallback to a provider/model combination that cannot satisfy the selected search mode.
- Preview and scheduled runs share the same model/tool policy.

## Current State (Today)

- LLM execution: Vercel AI SDK (AI Gateway), model ids like `openai/gpt-5-mini`.
- Web search toggle already exists: `jobs.allow_web_search`.
- Artifacts: store `llm_model`, `llm_usage`, tool calls, citations.

## Target State

### Data Model

- Add `jobs.llm_model` (string, gateway model id like `openai/gpt-5-mini`).
- Add `jobs.web_search_mode` (string):
  - `universal_perplexity`
  - `universal_parallel`
  - `openai_native`
  - `anthropic_native`
  - `google_native`

### UI (Job Editor)

- Model select (writes `llmModel` to job)
- Web search toggle (already exists)
- Web search mode select (only visible when web search toggle is on)
- Cost notice when web search is enabled (Perplexity/Parallel are billed per request)

### Execution Policy

- If `useWebSearch=false`: do not attach any search tools.
- If `useWebSearch=true`: attach the tool implied by `webSearchMode`.

### Routing / Fallback Policy (AI Gateway)

Use `providerOptions.gateway`:

- Provider-specific search mode:
  - Set `providerOptions.gateway.only` to the provider of the selected mode.
  - Ensure fallback models are restricted to that provider.
- Universal search mode (Perplexity/Parallel):
  - Tool is provider-agnostic; provider/model fallback is allowed.
  - (Optional) still allow an allowlist if you want cost control.

Relevant docs:
- Web Search modes and tools: https://vercel.com/docs/ai-gateway/capabilities/web-search
- Provider routing options (`only`, `order`): https://vercel.com/docs/ai-gateway/models-and-providers/provider-options
- Model fallback behavior: https://vercel.com/docs/ai-gateway/models-and-providers/model-fallbacks

## Rollout (Phased)

1) Add DB fields + UI controls (model + web search mode).
2) Switch LLM calls to AI Gateway and map `webSearchMode` to Gateway tools.
3) Add routing/fallback constraints via `providerOptions.gateway`.
4) Update run artifacts to record which search tool/mode was used.

## Environment

- Add `AI_GATEWAY_API_KEY`.
- Provider-specific BYOK keys depend on which providers you enable.
