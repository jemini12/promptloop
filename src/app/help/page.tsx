import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { SiteNav } from "@/components/site-nav";
import { LinkButton } from "@/components/ui/link-button";
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
            <LinkButton
              href="/signin?callbackUrl=/jobs/new"
              variant="primary"
              size="sm"
            >
              {uiText.help.cta.createJob}
            </LinkButton>
            <LinkButton
              href="/signin?callbackUrl=/dashboard"
              variant="secondary"
              size="sm"
            >
              {uiText.help.cta.viewDashboard}
            </LinkButton>
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
