import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { extractUsage } from "@/lib/ai-result";
import { DEFAULT_LLM_MODEL } from "@/lib/llm-defaults";
import { isRecord } from "@/lib/type-guards";

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
    "The improved_template must remain a single prompt (not a conversation).",
    "Do not introduce new {{var_name}} placeholders. If the original prompt contains {{...}} placeholders, keep them unchanged.",
    allowStrongerRewrite ? strongerRules : strictRules,
    "Do not include markdown code fences.",
  ].join("\n");
}

export async function enhancePrompt(input: EnhancePromptInput): Promise<EnhancePromptOutput> {
  const result = await generateText({
    model: openai(DEFAULT_LLM_MODEL),
    system: buildEnhancerInstructions(input.allowStrongerRewrite),
    prompt: input.prompt,
    timeout: 60_000,
  });

  try {
    const text = (result.text ?? "").trim();
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

    return {
      improvedTemplate,
      suggestedVariables,
      rationale,
      warnings,
      llmModel: DEFAULT_LLM_MODEL,
      llmUsage: extractUsage(result),
    };
  } catch (err) {
    throw err;
  }
}
