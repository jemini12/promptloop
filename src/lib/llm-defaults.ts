export const DEFAULT_LLM_MODEL = "google/gemini-3-flash" as const;
export const DEFAULT_WEB_SEARCH_MODE = "perplexity" as const;

export type WebSearchMode = typeof DEFAULT_WEB_SEARCH_MODE | "parallel";

export function normalizeWebSearchMode(mode: unknown): WebSearchMode {
  return mode === "parallel" ? "parallel" : DEFAULT_WEB_SEARCH_MODE;
}

export function normalizeLlmModel(model: unknown): string {
  if (typeof model !== "string") {
    return DEFAULT_LLM_MODEL;
  }
  const trimmed = model.trim();
  return trimmed ? trimmed : DEFAULT_LLM_MODEL;
}
