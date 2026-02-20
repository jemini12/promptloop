import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authz";
import { errorResponse } from "@/lib/http";
import { enforceDailyRunLimit } from "@/lib/limits";

export const maxDuration = 300;
import { enhancePrompt } from "@/lib/prompt-writer";
import { promptWriterEnhanceSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    await enforceDailyRunLimit(userId);

    const payload = promptWriterEnhanceSchema.parse(await request.json());
    const result = await enhancePrompt({
      prompt: payload.prompt,
      allowStrongerRewrite: payload.allowStrongerRewrite,
    });

    return NextResponse.json({
      improvedTemplate: result.improvedTemplate,
      suggestedVariables: result.suggestedVariables,
      rationale: result.rationale,
      warnings: result.warnings,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
