import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/authz";
import { errorResponse } from "@/lib/http";
import { jobUpsertSchema } from "@/lib/validation";
import { computeNextRunAt } from "@/lib/schedule";
import { toDbChannelConfig, toMaskedApiJob } from "@/lib/jobs";
import { recordAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const payload = await request.json();
    const parsed = jobUpsertSchema.parse(payload);

    const variables = parsed.variables ? (JSON.parse(parsed.variables || "{}") as Record<string, string>) : {};

    const exists = await prisma.job.findFirst({ where: { id, userId }, select: { id: true } });
    if (!exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { channelType, channelConfig } = toDbChannelConfig(parsed.channel);
    const nextRunAt = computeNextRunAt({
      scheduleType: parsed.scheduleType,
      scheduleTime: parsed.scheduleTime,
      scheduleDayOfWeek: parsed.scheduleDayOfWeek,
      scheduleCron: parsed.scheduleCron,
    });

    const job = await prisma.job.update({
      where: { id },
      data: {
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
      action: "job.update",
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

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    await prisma.job.deleteMany({ where: { id, userId } });

    await recordAudit({
      userId,
      action: "job.delete",
      entityType: "job",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
