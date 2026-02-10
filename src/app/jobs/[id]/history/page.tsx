import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { SiteNav } from "@/components/site-nav";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Run History",
  description: "View recent execution history and errors for a scheduled job.",
};

export default async function JobHistoryPage({ params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin?callbackUrl=/dashboard");
  }

  const { id } = await params;
  const job = await prisma.job.findFirst({
    where: { id, userId: session.user.id },
    include: {
      runHistories: {
        orderBy: { runAt: "desc" },
        take: 100,
      },
    },
  });
  if (!job) {
    notFound();
  }

  return (
    <main className="page-shell">
      <SiteNav signedIn />
      <section className="content-shell max-w-3xl py-8">
        <Link href="/dashboard" className="back-link">
          {"<- Back to Dashboard"}
        </Link>
        <h1 className="mt-3 text-xl font-semibold text-zinc-900">{job.name} · Run History</h1>
        {job.runHistories.length === 0 ? (
          <div className="surface-card mt-4 border-dashed bg-zinc-50/60 p-5">
            <p className="text-sm font-medium text-zinc-900">No run history yet</p>
            <p className="mt-1 text-xs text-zinc-500">This job has not executed yet. Check back after its next scheduled run.</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {job.runHistories.map((history) => (
              <li key={history.id} className="surface-card p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-800">
                  <span
                    className={
                      history.status === "success"
                        ? "status-pill status-pill-success"
                        : history.status === "fail"
                          ? "status-pill status-pill-fail"
                          : "status-pill status-pill-neutral"
                    }
                  >
                    {history.status}
                  </span>
                  <p>{format(history.runAt, "PPp")}</p>
                </div>
                {history.errorMessage ? <p className="mt-1 text-xs text-zinc-500">{history.errorMessage}</p> : null}
                {history.outputPreview ? (
                  <p className="line-clamp-2 mt-1 text-xs text-zinc-500" title={history.outputPreview}>
                    {history.outputPreview}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
