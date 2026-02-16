import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/authz";
import { errorResponse } from "@/lib/http";
import { jobUpsertSchema } from "@/lib/validation";
import { computeNextRunAt } from "@/lib/schedule";
import { toDbChannelConfig, toMaskedApiJob } from "@/lib/jobs";

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
        allowWebSearch: parsed.allowWebSearch,
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
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
