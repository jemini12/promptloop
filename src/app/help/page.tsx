import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth-options";
import { SiteNav } from "@/components/site-nav";
import { uiText } from "@/content/ui-text";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: uiText.help.title,
  description: uiText.help.description,
};

export default async function HelpPage() {
  const session = await getServerSession(authOptions);
  const signedIn = Boolean(session?.user?.id);

  return (
    <main className="page-shell">
      <SiteNav signedIn={signedIn} />
      <section className="content-shell max-w-4xl py-10">
        <h1 className="text-3xl font-semibold text-zinc-900">{uiText.help.title}</h1>
        <p className="mt-2 text-sm text-zinc-600">{uiText.help.description}</p>
        {!signedIn ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/signin?callbackUrl=/jobs/new"
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 transition-colors"
            >
              {uiText.help.cta.createJob}
            </Link>
            <Link
              href="/signin?callbackUrl=/dashboard"
              className="inline-flex items-center justify-center rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-100 transition-colors"
            >
              {uiText.help.cta.viewDashboard}
            </Link>
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          <section className="surface-card">
            <h2 className="text-sm font-semibold text-zinc-900">{uiText.help.quickStart.title}</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
              {uiText.help.quickStart.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section className="surface-card">
            <h2 className="text-sm font-semibold text-zinc-900">{uiText.help.channelSetup.title}</h2>
            <ul className="mt-2 space-y-2 text-sm text-zinc-700">
              {uiText.help.channelSetup.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="surface-card">
            <h2 className="text-sm font-semibold text-zinc-900">{uiText.help.preview.title}</h2>
            <p className="mt-2 text-sm text-zinc-700">
              {uiText.help.preview.description}
            </p>
          </section>

          <section className="surface-card">
            <h2 className="text-sm font-semibold text-zinc-900">{uiText.help.issues.title}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              {uiText.help.issues.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}
