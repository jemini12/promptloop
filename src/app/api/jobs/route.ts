import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/authz";
import { errorResponse } from "@/lib/http";
import { jobUpsertSchema } from "@/lib/validation";
import { computeNextRunAt } from "@/lib/schedule";
import { toDbChannelConfig, toMaskedApiJob } from "@/lib/jobs";
import { recordAudit } from "@/lib/audit";

export async function GET() {
  try {
    const userId = await requireUserId();
    const jobs = await prisma.job.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ jobs: jobs.map(toMaskedApiJob) });
  } catch (error) {
    return errorResponse(error, 401);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const payload = await request.json();
    const parsed = jobUpsertSchema.parse(payload);

    const variables = parsed.variables ? (JSON.parse(parsed.variables || "{}") as Record<string, string>) : {};

    const { channelType, channelConfig } = toDbChannelConfig(parsed.channel);
    const nextRunAt = computeNextRunAt({
      scheduleType: parsed.scheduleType,
      scheduleTime: parsed.scheduleTime,
      scheduleDayOfWeek: parsed.scheduleDayOfWeek,
      scheduleCron: parsed.scheduleCron,
    });

    const job = await prisma.job.create({
      data: {
        userId,
        name: parsed.name,
        prompt: parsed.template,
        allowWebSearch: parsed.useWebSearch,
        llmModel: parsed.llmModel || null,
        webSearchMode: parsed.webSearchMode || null,
        scheduleType: parsed.scheduleType,
        scheduleTime: parsed.scheduleTime,
        scheduleDayOfWeek: parsed.scheduleDayOfWeek,
        scheduleCron: parsed.scheduleCron,
        channelType,
        channelConfig,
        enabled: parsed.enabled,
        nextRunAt,
        promptVersions: {
          create: {
            template: parsed.template,
            variables,
          },
        },
      },
      include: { promptVersions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    const latest = job.promptVersions[0];
    const updated = await prisma.job.update({
      where: { id: job.id },
      data: { publishedPromptVersionId: latest?.id ?? null },
    });

    await recordAudit({
      userId,
      action: "job.create",
      entityType: "job",
      entityId: updated.id,
      data: {
        useWebSearch: updated.allowWebSearch,
        llmModel: updated.llmModel,
        webSearchMode: updated.webSearchMode,
        scheduleType: updated.scheduleType,
        scheduleTime: updated.scheduleTime,
        scheduleDayOfWeek: updated.scheduleDayOfWeek,
        scheduleCron: updated.scheduleCron,
        channelType: updated.channelType,
        enabled: updated.enabled,
      },
    });

    if (latest?.id) {
      await recordAudit({
        userId,
        action: "prompt.publish",
        entityType: "prompt_version",
        entityId: latest.id,
        data: { jobId: updated.id },
      });
    }

    return NextResponse.json({ job: toMaskedApiJob(updated) });
  } catch (error) {
    return errorResponse(error);
  }
}
