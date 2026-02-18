import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/authz";
import { errorResponse } from "@/lib/http";
import { DEFAULT_LLM_MODEL, DEFAULT_WEB_SEARCH_MODE } from "@/lib/llm-defaults";
import { generatePromptDraftFromIntent, inferUseWebSearch, proposeSchedule } from "@/lib/job-intents";

const bodySchema = z.object({
  intentText: z.string().min(1).max(8000),
});

export async function POST(req: NextRequest) {
  try {
    await requireUserId();
    const payload = bodySchema.parse(await req.json());

    const scheduleResult = proposeSchedule(payload.intentText);
    const useWebSearch = inferUseWebSearch(payload.intentText);

    if (!scheduleResult.schedule) {
      return NextResponse.json({
        status: "needs_clarification" as const,
        clarifications: scheduleResult.clarifications,
      });
    }

    const draft = await generatePromptDraftFromIntent(payload.intentText);
    const variablesJson = JSON.stringify(draft.suggestedVariables ?? {}, null, 2);

    return NextResponse.json({
      status: "ok" as const,
      clarifications: [],
      proposedJob: {
        name: draft.name,
        template: draft.template,
        variables: variablesJson,
        useWebSearch,
        llmModel: DEFAULT_LLM_MODEL,
        webSearchMode: DEFAULT_WEB_SEARCH_MODE,
        schedule: scheduleResult.schedule,
        rationale: draft.rationale,
        warnings: draft.warnings,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
