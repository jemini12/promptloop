import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { SiteNav } from "@/components/site-nav";

function CardIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 text-zinc-700" aria-hidden>
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  const signedIn = Boolean(session?.user?.id);
  const primaryHref = signedIn ? "/jobs/new" : "/signin?callbackUrl=/jobs/new";
  const primaryLabel = signedIn ? "Create Job" : "Sign in to Create";
  const secondaryHref = signedIn ? "/dashboard" : "/help";
  const secondaryLabel = signedIn ? "View Dashboard" : "Help";

  return (
    <main className="page-shell">
      <SiteNav signedIn={signedIn} />
      <section className="content-shell pb-16 pt-12 sm:pt-16">
        <div className="surface-card overflow-hidden p-7 sm:p-9">
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-zinc-900 sm:text-5xl">Automate recurring prompts with reliable scheduled runs.</h1>
          <p className="mt-4 max-w-2xl text-sm text-zinc-600 sm:text-base">
            Promptly runs your prompt on schedule, lets you validate output before saving, and delivers final messages to
            Discord or Telegram.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center rounded-lg border border-transparent bg-zinc-900 px-5 py-3 text-base font-medium text-white shadow-sm hover:bg-zinc-800 transition-all active:translate-y-px"
            >
              {primaryLabel}
            </Link>
            <Link
              href={secondaryHref}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-5 py-3 text-base font-medium text-zinc-900 shadow-sm hover:bg-zinc-100 transition-all active:translate-y-px"
            >
              {secondaryLabel}
            </Link>
          </div>

          <div className="mt-8 grid gap-2 text-xs text-zinc-600 sm:grid-cols-3 sm:text-sm">
            <p className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2">Preview before saving changes</p>
            <p className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2">Daily, weekly, or cron schedule</p>
            <p className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2">Discord and Telegram delivery</p>
          </div>
        </div>
      </section>

      <section className="content-shell grid gap-3 pb-20 sm:grid-cols-3">
        <article className="surface-card">
          <CardIcon path="M12 3v18M3 12h18" />
          <h2 className="mt-3 text-sm font-semibold text-zinc-900">1. Write Prompt</h2>
          <p className="mt-2 text-xs text-zinc-600">Define a clear task and run preview before saving.</p>
        </article>
        <article className="surface-card">
          <CardIcon path="M8 7h8M8 12h8M8 17h5M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
          <h2 className="mt-3 text-sm font-semibold text-zinc-900">2. Set Schedule</h2>
          <p className="mt-2 text-xs text-zinc-600">Choose daily, weekly, or cron timing.</p>
        </article>
        <article className="surface-card">
          <CardIcon path="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          <h2 className="mt-3 text-sm font-semibold text-zinc-900">3. Deliver Output</h2>
          <p className="mt-2 text-xs text-zinc-600">Send final responses to your chosen channel automatically.</p>
        </article>
      </section>
    </main>
  );
}
