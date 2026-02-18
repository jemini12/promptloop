import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tryLoadDotEnv() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(here, "..", ".env");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function extractCitationsFromToolResults(toolResults) {
  if (!Array.isArray(toolResults)) return [];

  const out = [];
  const seen = new Set();

  for (const tr of toolResults) {
    if (!tr || typeof tr !== "object") continue;

    const container =
      tr.output && typeof tr.output === "object" && tr.output !== null
        ? tr.output
        : tr.result && typeof tr.result === "object" && tr.result !== null
          ? tr.result
          : null;
    if (!container) continue;

    const results = container.results;
    if (!Array.isArray(results)) continue;

    for (const r of results) {
      if (!r || typeof r !== "object") continue;
      const url = typeof r.url === "string" ? r.url : "";
      const title = typeof r.title === "string" ? r.title : "";
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, title: title || undefined });
    }
  }

  return out;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toJsonValue(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function extractToolCallParts(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const v of value) {
    if (!isRecord(v)) continue;
    if (v.type !== "tool-call") continue;
    const toolCallId = typeof v.toolCallId === "string" ? v.toolCallId : "";
    const toolName = typeof v.toolName === "string" ? v.toolName : "";
    const input = "input" in v ? v.input : undefined;
    const providerOptionsRaw =
      "providerOptions" in v
        ? v.providerOptions
        : "providerMetadata" in v
          ? v.providerMetadata
          : undefined;
    const providerOptions = isRecord(providerOptionsRaw) ? providerOptionsRaw : undefined;
    if (!toolCallId || !toolName) continue;
    out.push({
      type: "tool-call",
      toolCallId,
      toolName,
      input,
      ...(providerOptions ? { providerOptions } : {}),
    });
  }
  return out;
}

function extractToolResultParts(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const v of value) {
    if (!isRecord(v)) continue;
    if (v.type !== "tool-result") continue;
    const toolCallId = typeof v.toolCallId === "string" ? v.toolCallId : "";
    const toolName = typeof v.toolName === "string" ? v.toolName : "";
    const rawOutput = "output" in v ? v.output : undefined;
    const isError = typeof v.isError === "boolean" ? v.isError : false;
    if (!toolCallId || !toolName) continue;

    const json = toJsonValue(rawOutput);
    const output =
      json != null
        ? isError
          ? { type: "error-json", value: json }
          : { type: "json", value: json }
        : isError
          ? { type: "error-text", value: String(rawOutput) }
          : { type: "text", value: String(rawOutput) };

    out.push({ type: "tool-result", toolCallId, toolName, output });
  }
  return out;
}

async function runWebSearchFlow({ generateText, gateway, model, mode }) {
  const prompt = "Find an official Vercel AI Gateway docs page and return its URL.";

  const startSearch = Date.now();
  const searchStep = await generateText({
    model,
    system: "Use the provided web search tool. Return nothing except the tool call.",
    prompt,
    tools: { perplexity_search: gateway.tools.perplexitySearch({ maxResults: 3 }) },
    toolChoice: "required",
    activeTools: ["perplexity_search"],
    timeout: 60_000,
  });

  const toolCalls = searchStep?.toolCalls;
  const toolResults = searchStep?.toolResults;
  assert(Array.isArray(toolCalls) && toolCalls.length > 0, `expected toolCalls array (non-empty)`);
  assert(Array.isArray(toolResults) && toolResults.length > 0, `expected toolResults array (non-empty)`);
  const citations = extractCitationsFromToolResults(toolResults);

  const resultsText = citations
    .slice(0, 5)
    .map((c, idx) => `[${idx + 1}] ${c.title ? c.title + " — " : ""}${c.url}`)
    .join("\n");

  const searchMs = Date.now() - startSearch;

  const startAnswer = Date.now();
  const answerStep = await generateText({
    model,
    system: "Answer the user. Use the provided web search results when relevant. Include one URL in the answer.",
    prompt: `${prompt}\n\nWeb search results:\n${resultsText}`,
    timeout: 60_000,
  });

  const answerMs = Date.now() - startAnswer;
  const text = (answerStep?.text ?? "").trim();
  assert(text.length > 0, `[${mode}] expected non-empty final answer text`);

  return {
    prompt,
    searchMs,
    answerMs,
    toolCallsCount: toolCalls.length,
    toolResultsCount: toolResults.length,
    citations,
    answerText: text,
  };
}

async function tryWebSearchFlowWithModels({ generateText, gateway, models, mode }) {
  let lastErr = null;
  for (const model of models) {
    try {
      const res = await runWebSearchFlow({ generateText, gateway, model, mode });
      return { ok: true, model, res };
    } catch (err) {
      lastErr = err;
      console.warn(`WARN web search failed for model=${model}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { ok: false, model: models[0] || "", res: null, error: lastErr };
}

async function main() {
  tryLoadDotEnv();

  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || "";
  assert(apiKey, "Missing AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN). Add it to .env or export it.");

  const baseModel = (process.env.AI_GATEWAY_SMOKE_MODEL || "google/gemini-3-flash").trim();
  assert(baseModel.includes("/"), `AI_GATEWAY_SMOKE_MODEL must look like provider/model, got ${JSON.stringify(baseModel)}`);

  const toolModelsRaw = (process.env.AI_GATEWAY_SMOKE_TOOL_MODELS || "openai/gpt-5-mini,anthropic/claude-sonnet-4.5").trim();
  const toolModels = toolModelsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s.includes("/"));
  assert(toolModels.length > 0, "AI_GATEWAY_SMOKE_TOOL_MODELS must include at least one provider/model");

  const { generateText, gateway } = await import("ai");

  console.log(`AI Gateway smoke: baseModel=${baseModel}`);
  console.log(`AI Gateway smoke: toolModels=${toolModels.join(", ")}`);

  const startBasic = Date.now();
  const basic = await generateText({
    model: baseModel,
    prompt: "Return exactly: OK",
    timeout: 60_000,
  });
  const basicText = (basic?.text ?? "").trim();
  assert(basicText === "OK", `basic generateText expected "OK", got ${JSON.stringify(basicText)}`);
  console.log(`OK basic generateText (${formatMs(Date.now() - startBasic)})`);

  const perplexityTry = await tryWebSearchFlowWithModels({ generateText, gateway, models: toolModels, mode: "perplexity" });
  if (!perplexityTry.ok) {
    throw perplexityTry.error ?? new Error("Web search failed for all tool models");
  }
  const perplexity = perplexityTry.res;
  console.log(
    `OK web search perplexity (search ${formatMs(perplexity.searchMs)}, answer ${formatMs(perplexity.answerMs)}; toolCalls=${perplexity.toolCallsCount}; toolResults=${perplexity.toolResultsCount}; citations=${perplexity.citations.length})`,
  );
  console.log(`perplexity toolModel: ${perplexityTry.model}`);
  console.log(`perplexity answer: ${perplexity.answerText.slice(0, 240)}${perplexity.answerText.length > 240 ? "…" : ""}`);
  if (perplexity.citations.length) {
    console.log("perplexity citations:");
    for (const c of perplexity.citations.slice(0, 3)) {
      console.log(`- ${c.title ? c.title + " — " : ""}${c.url}`);
    }
  }

  console.log("AI GATEWAY SMOKE OK");
}

main().catch((err) => {
  console.error("AI GATEWAY SMOKE FAIL", err);
  process.exit(1);
});
