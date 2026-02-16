import { prisma } from "@/lib/prisma";

export async function getOrCreatePublishedPromptVersion(jobId: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId }, select: { id: true, prompt: true, publishedPromptVersionId: true } });
    if (!job) {
      throw new Error("Job not found");
    }

    if (job.publishedPromptVersionId) {
      const pv = await tx.promptVersion.findUnique({ where: { id: job.publishedPromptVersionId } });
      if (pv) {
        return pv;
      }
    }

    const created = await tx.promptVersion.create({
      data: {
        jobId: job.id,
        template: job.prompt,
        variables: {},
      },
    });

    const updated = await tx.job.updateMany({ where: { id: job.id, publishedPromptVersionId: null }, data: { publishedPromptVersionId: created.id } });
    if (updated.count === 1) {
      return created;
    }

    await tx.promptVersion.delete({ where: { id: created.id } });

    const latest = await tx.job.findUnique({ where: { id: job.id }, select: { publishedPromptVersionId: true } });
    if (!latest?.publishedPromptVersionId) {
      throw new Error("Failed to publish prompt version");
    }
    const pv = await tx.promptVersion.findUnique({ where: { id: latest.publishedPromptVersionId } });
    if (!pv) {
      throw new Error("Published prompt version missing");
    }
    return pv;
  });
}
