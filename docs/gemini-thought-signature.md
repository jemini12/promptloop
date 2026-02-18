# Gemini thought_signature notes

This repo uses Vercel AI SDK tool calling in a 2-step flow (tool call -> tool result -> final answer). Gemini (Google/Vertex) can require a thought signature to be preserved when replaying tool call transcripts.

## What it is

- A provider-specific field attached to content parts (including function/tool call parts) that Gemini uses to validate multi-turn tool calling.
- If it is missing when tool calls are involved, Gemini can reject the request (400) with an error like "Function call is missing a thought_signature".

## Field names in official docs

- Vertex AI docs use `thought_signature` (snake_case).
- Gemini API docs use `thoughtSignature` (camelCase).

References:
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/thought-signatures
- https://ai.google.dev/gemini-api/docs/thought-signatures

## Why it broke here

Our web-search path uses a 2-step transcript replay:

1) Step 1: `generateText()` with a search tool enabled produces `toolCalls` and `toolResults`.
2) Step 2: we replay those as `messages` (assistant tool-call parts + tool-result parts) to get the final answer.

Gemini expects provider metadata from Step 1 tool call parts to be forwarded when constructing the Step 2 message parts. Dropping it can trigger the thought_signature error.

## How we fixed it

- AI SDK prompt message parts support `providerOptions` on `ToolCallPart` and `ToolResultPart` (this is the documented pass-through channel).
- At runtime, tool calls/results may include `providerMetadata`. We now copy that into `providerOptions` when building replay parts.

Code paths:
- `src/lib/llm.ts` preserves provider metadata in replay parts.
- `scripts/ai-gateway-smoke.mjs` does the same for the smoke test.

## Follow-ups

- Consider setting gateway routing for web-search requests (providerOptions.gateway.only/order) so the gateway does not fall back to providers/models with incompatible tool-calling requirements.
- Keep the smoke test pinned to a Gemini model for web search to detect regressions: `AI_GATEWAY_SMOKE_TOOL_MODELS=google/gemini-3-flash`.
