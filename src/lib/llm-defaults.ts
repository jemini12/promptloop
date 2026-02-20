export const DEFAULT_LLM_MODEL = "gpt-5-mini" as const;
export const DEFAULT_WEB_SEARCH_MODE = "native" as const;

export type WebSearchMode = typeof DEFAULT_WEB_SEARCH_MODE | "parallel";

export function normalizeWebSearchMode(mode: unknown): WebSearchMode {
  return mode === "parallel" ? "parallel" : DEFAULT_WEB_SEARCH_MODE;
}

export function normalizeLlmModel(model: unknown): string {
  if (typeof model !== "string") {
    return DEFAULT_LLM_MODEL;
  }
  const trimmed = model.trim();
  if (!trimmed) return DEFAULT_LLM_MODEL;

  if (trimmed.includes("/")) {
    const [provider, rest] = trimmed.split("/", 2);
    if (provider === "openai" && rest && rest.trim()) {
      return rest.trim();
    }
    return DEFAULT_LLM_MODEL;
  }

  return trimmed;
}

export const AVAILABLE_OPENAI_MODELS: Array<{ id: string; name: string }> = [
  { id: "gpt-5-mini", name: "gpt-5-mini" },
  { id: "gpt-5.2", name: "gpt-5.2" },
  { id: "gpt-5.1", name: "gpt-5.1" },
  { id: "gpt-5", name: "gpt-5" },
];
