import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { decryptString } from "@/lib/crypto";
import { JobEditorPage } from "@/components/job-editor/job-editor-page";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Edit Job",
  description: "Update prompt, schedule, and delivery settings for an existing job.",
};

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function EditJobPage({ params }: Params) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/jobs/${id}/edit`)}`);
  }
  const job = await prisma.job.findFirst({
    where: { id, userId: session.user.id },
    include: { publishedPromptVersion: true },
  });
  if (!job) {
    notFound();
  }

  const template = job.publishedPromptVersion?.template ?? job.prompt;
  const variables = JSON.stringify((job.publishedPromptVersion?.variables as object | null) ?? {}, null, 2);

  const channel =
    job.channelType === "discord"
      ? {
          type: "discord" as const,
          config: {
            webhookUrl: decryptString((job.channelConfig as { webhookUrlEnc: string }).webhookUrlEnc),
          },
        }
      : job.channelType === "webhook"
        ? {
            type: "webhook" as const,
            config: JSON.parse(decryptString((job.channelConfig as { configEnc: string }).configEnc)) as {
              url: string;
              method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
              headers: string;
              payload: string;
            },
          }
      : {
          type: "telegram" as const,
          config: {
            botToken: decryptString((job.channelConfig as { botTokenEnc: string }).botTokenEnc),
            chatId: decryptString((job.channelConfig as { chatIdEnc: string }).chatIdEnc),
          },
        };

  return (
    <main className="page-shell">
      <SiteNav signedIn />
      <section className="content-shell max-w-3xl pt-6">
        <JobEditorPage
          jobId={job.id}
          initialState={{
            name: job.name,
            prompt: template,
            variables,
            allowWebSearch: job.allowWebSearch,
            scheduleType: job.scheduleType,
            time: job.scheduleTime,
            dayOfWeek: job.scheduleDayOfWeek ?? undefined,
            cron: job.scheduleCron ?? "",
            channel,
            enabled: job.enabled,
          }}
        />
      </section>
    </main>
  );
}
