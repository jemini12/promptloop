import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/authz";
import { errorResponse } from "@/lib/http";
import { runPrompt } from "@/lib/llm";
import { sendChannelMessage } from "@/lib/channel";
import { toRunnableChannel } from "@/lib/jobs";
import { enforceDailyRunLimit } from "@/lib/limits";
import { getOrCreatePublishedPromptVersion } from "@/lib/prompt-version";
import { normalizeLlmModel, normalizeWebSearchMode } from "@/lib/llm-defaults";
import { compilePromptTemplate, coerceStringVars } from "@/lib/prompt-compile";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  testSend: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    await enforceDailyRunLimit(userId);
    const { id } = await params;
    const body = bodySchema.parse(await request.json());

    const job = await prisma.job.findFirst({ where: { id, userId }, include: { publishedPromptVersion: true } });
    if (!job) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const pv = job.publishedPromptVersion ?? (await getOrCreatePublishedPromptVersion(job.id));
    const vars = coerceStringVars(pv.variables);
    const prompt = compilePromptTemplate(pv.template, vars);

    const result = await runPrompt(prompt, {
      model: normalizeLlmModel(job.llmModel),
      useWebSearch: job.allowWebSearch,
      webSearchMode: normalizeWebSearchMode(job.webSearchMode),
    });
    const title = `[${job.name}] ${format(new Date(), "yyyy-MM-dd HH:mm")}`;

    if (body.testSend) {
      await sendChannelMessage(toRunnableChannel(job), title, result.output, {
        citations: result.citations,
        usedWebSearch: result.usedWebSearch,
        meta: { kind: "job-preview", jobId: job.id, promptVersionId: pv.id },
      });
    }

    await prisma.runHistory.create({
      data: {
        job: { connect: { id: job.id } },
        promptVersion: { connect: { id: pv.id } },
        status: "success",
        outputText: result.output,
        outputPreview: result.output.slice(0, 1000),
        llmModel: result.llmModel ?? null,
        llmUsage: result.llmUsage == null ? Prisma.DbNull : (result.llmUsage as Prisma.InputJsonValue),
        llmToolCalls: result.llmToolCalls == null ? Prisma.DbNull : (result.llmToolCalls as Prisma.InputJsonValue),
        usedWebSearch: result.usedWebSearch,
        citations: (result.citations as unknown as Prisma.InputJsonValue) ?? Prisma.DbNull,
        isPreview: true,
      },
    });
    await prisma.previewEvent.create({ data: { userId } });

    return NextResponse.json({
      status: "success",
      output: result.output,
      executedAt: new Date().toISOString(),
      usedWebSearch: result.usedWebSearch,
      citations: result.citations,
      llmModel: result.llmModel ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
