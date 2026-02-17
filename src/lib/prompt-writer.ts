import OpenAI from "openai";

type EnhancePromptInput = {
  prompt: string;
  allowStrongerRewrite: boolean;
};

type EnhancePromptOutput = {
  improvedTemplate: string;
  suggestedVariables: Record<string, string>;
  rationale: string;
  warnings: string[];
  llmModel?: string;
  llmUsage?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.length > 0) : [];
}

function asStringVars(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof k === "string" && typeof v === "string") {
      out[k] = v;
    }
  }
  return out;
}

function buildEnhancerInstructions(allowStrongerRewrite: boolean): string {
  const strictRules =
    "STRICT MODE: Preserve the original intent and requirements exactly. You may only improve clarity, structure, explicit formatting, and remove ambiguity. Do not add new constraints, new tasks, new assumptions, or new evaluation criteria.";
  const strongerRules =
    "STRONGER REWRITE MODE: You may add reasonable prompt-engineering scaffolding (sections, checklists, explicit output format) as long as it does not change the user's intent. If you add any new constraints, list them in warnings.";

  return [
    "You are a prompt editor.",
    "Return JSON only with keys: improved_template (string), suggested_variables (object of string->string), rationale (string), warnings (array of strings).",
    "The improved_template must remain a single prompt template (not a conversation).",
    "Keep any {{var_name}} placeholders; do not rename placeholders unless necessary to fix inconsistencies (if you rename, add a warning).",
    allowStrongerRewrite ? strongerRules : strictRules,
    "Do not include markdown code fences.",
  ].join("\n");
}

export async function enhancePrompt(input: EnhancePromptInput): Promise<EnhancePromptOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }
  const openai = new OpenAI({ apiKey });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await openai.responses.create(
      {
        model: "gpt-5-mini",
        instructions: buildEnhancerInstructions(input.allowStrongerRewrite),
        input: input.prompt,
      },
      { signal: controller.signal },
    );

    const text = (response.output_text ?? "").trim();
    if (!text) {
      throw new Error("LLM returned empty output");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Enhancer returned non-JSON output");
    }

    if (!isRecord(parsed)) {
      throw new Error("Enhancer returned invalid JSON");
    }

    const improvedTemplate = asString(parsed.improved_template) ?? "";
    if (!improvedTemplate.trim()) {
      throw new Error("Enhancer returned empty improved_template");
    }

    const rationale = asString(parsed.rationale) ?? "";
    const warnings = asStringArray(parsed.warnings);
    const suggestedVariables = asStringVars(parsed.suggested_variables);

    const model = typeof response.model === "string" ? response.model : undefined;
    const usage = (response as unknown as { usage?: unknown }).usage;

    return { improvedTemplate, suggestedVariables, rationale, warnings, llmModel: model, llmUsage: usage };
  } finally {
    clearTimeout(timeout);
  }
}
