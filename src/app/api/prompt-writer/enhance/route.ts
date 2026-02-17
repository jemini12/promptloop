import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/authz";
import { errorResponse } from "@/lib/http";
import { enforceDailyRunLimit } from "@/lib/limits";
import { enhancePrompt } from "@/lib/prompt-writer";

const enhanceSchema = z.object({
  prompt: z.string().min(1).max(8000),
  allowStrongerRewrite: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    await enforceDailyRunLimit(userId);

    const payload = enhanceSchema.parse(await request.json());
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
