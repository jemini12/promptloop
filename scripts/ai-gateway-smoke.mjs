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

function citationsFromSources(sources) {
  if (!Array.isArray(sources)) return [];
  const out = [];
  const seen = new Set();

  for (const s of sources) {
    if (!s || typeof s !== "object") continue;
    if (s.type !== "source") continue;
    if (s.sourceType !== "url") continue;
    const url = typeof s.url === "string" ? s.url : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = typeof s.title === "string" ? s.title : "";
    out.push({ url, title: title || undefined });
  }

  return out;
}

function toolForModel({ openai, anthropic, google, model }) {
  if (model.startsWith("openai/")) {
    return { toolName: "web_search", tools: { web_search: openai.tools.webSearch({}) } };
  }
  if (model.startsWith("anthropic/")) {
    return { toolName: "web_search", tools: { web_search: anthropic.tools.webSearch_20250305({ maxUses: 1 }) } };
  }
  if (model.startsWith("google/")) {
    return {
      toolName: "google_search",
      tools: { google_search: google.tools.googleSearch({ mode: "MODE_UNSPECIFIED", dynamicThreshold: 1 }) },
    };
  }
  return null;
}

function parseSearchPrompts() {
  const raw = (process.env.AI_GATEWAY_SMOKE_SEARCH_PROMPTS || "").trim();
  if (!raw) {
    return [
      "Find an official Vercel AI Gateway docs page and return its URL.",
      "What does Vercel AI Gateway do? Answer in 2 bullets and cite sources.",
      "Find the Vercel AI Gateway web search docs page and return its URL.",
    ];
  }

  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  tryLoadDotEnv();

  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || "";
  assert(apiKey, "Missing AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN). Add it to .env or export it.");

  const modelsRaw = (process.env.AI_GATEWAY_SMOKE_SEARCH_MODELS ||
    "openai/gpt-5-mini,anthropic/claude-sonnet-4.5,google/gemini-3-flash").trim();
  const models = modelsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s.includes("/"));
  assert(models.length > 0, "AI_GATEWAY_SMOKE_SEARCH_MODELS must include at least one provider/model");

  const { generateText } = await import("ai");
  const { openai } = await import("@ai-sdk/openai");
  const { anthropic } = await import("@ai-sdk/anthropic");
  const { google } = await import("@ai-sdk/google");

  console.log(`AI Gateway smoke: provider-native web search`);
  console.log(`AI Gateway smoke: searchModels=${models.join(", ")}`);

  const prompts = parseSearchPrompts();
  console.log(`AI Gateway smoke: prompts=${prompts.length}`);

  for (const model of models) {
    for (let i = 0; i < prompts.length; i += 1) {
      const prompt = prompts[i];
      const tool = toolForModel({ openai, anthropic, google, model });
      assert(tool, `No provider-native tool for model=${model}`);

      const startedAt = Date.now();
      const result = await generateText({
        model,
        prompt,
        tools: tool.tools,
        activeTools: [tool.toolName],
        toolChoice: "required",
        timeout: 60_000,
      });

      const text = (result?.text ?? "").trim();
      assert(text.length > 0, `expected non-empty response text for model=${model}`);
      const citations = citationsFromSources(result?.sources);
      assert(citations.length > 0, `expected sources for model=${model}`);

      console.log(
        `OK provider-native web search model=${model} case=${i + 1}/${prompts.length} (${formatMs(Date.now() - startedAt)}; sources=${citations.length})`,
      );
      console.log(`answer: ${text.slice(0, 240)}${text.length > 240 ? "…" : ""}`);
      for (const c of citations.slice(0, 3)) {
        console.log(`- ${c.title ? c.title + " — " : ""}${c.url}`);
      }
    }
  }

  console.log("AI GATEWAY SMOKE OK");
}

main().catch((err) => {
  console.error("AI GATEWAY SMOKE FAIL", err);
  process.exit(1);
});
