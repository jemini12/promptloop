import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { SiteNav } from "@/components/site-nav";


export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Dashboard",
  description: "Track scheduled jobs, upcoming runs, and recent execution status.",
};

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path d="M12 3l1.9 4.1L18 9l-4.1 1.9L12 15l-1.9-4.1L6 9l4.1-1.9L12 3z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 17l.9 2.1L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-.9L5 17z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin?callbackUrl=/dashboard");
  }

  const jobs = await prisma.job.findMany({
    where: { userId: session.user.id },
    include: {
      runHistories: {
        orderBy: { runAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const hasJobs = jobs.length > 0;

  return (
    <main className="page-shell">
      <SiteNav signedIn />
      <section className="content-shell py-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
            <p className="text-sm text-zinc-500">Manage schedules and monitor the latest run results.</p>
            <p className="mt-2 inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600">
              {jobs.length} total job{jobs.length === 1 ? "" : "s"}
            </p>
          </div>
          <div>
            <Link
              href="/jobs/new"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 transition-all active:translate-y-px"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create Job
            </Link>
          </div>
        </div>

        <section className="surface-card p-4">
          {!hasJobs ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-gradient-to-b from-zinc-50 to-white px-5 py-9 text-center">
              <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700">
                <SparkIcon />
              </span>
              <p className="mt-4 text-base font-semibold text-zinc-900">No jobs yet</p>
              <p className="mx-auto mt-1 max-w-lg text-sm text-zinc-500">Create your first scheduled prompt to start automation.</p>
              <Link
                href="/jobs/new"
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 transition-all active:translate-y-px"
              >
                Create Job
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {jobs.map((job) => {
                const latest = job.runHistories[0];
                const latestStatusClass = latest
                  ? latest.status === "success"
                    ? "status-pill status-pill-success"
                    : latest.status === "fail"
                      ? "status-pill status-pill-fail"
                      : "status-pill status-pill-neutral"
                  : "status-pill status-pill-neutral";
                return (
                  <li key={job.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-900">{job.name}</h3>
                        <p className="text-xs text-zinc-500">next run {format(job.nextRunAt, "PPp")} · {job.enabled ? "enabled" : "disabled"}</p>
                      </div>
                      <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
                        <Link
                          href={`/jobs/${job.id}/edit`}
                          className="inline-flex items-center justify-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/jobs/${job.id}/history`}
                          className="inline-flex items-center justify-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                        >
                          History
                        </Link>
                      </div>
                    </div>
                    {latest ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                        <span className={latestStatusClass}>{latest.status}</span>
                        <p>last run at {format(latest.runAt, "PPp")}</p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
