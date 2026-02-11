import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { SiteNav } from "@/components/site-nav";
import { LinkButton } from "@/components/ui/link-button";
import { uiText } from "@/content/ui-text";

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
  const primaryLabel = signedIn ? uiText.landing.cta.primarySignedIn : uiText.landing.cta.primarySignedOut;
  const secondaryHref = signedIn ? "/dashboard" : "/help";
  const secondaryLabel = signedIn ? uiText.landing.cta.secondarySignedIn : uiText.landing.cta.secondarySignedOut;

  return (
    <main className="page-shell">
      <SiteNav signedIn={signedIn} />
      <section className="content-shell pb-16 pt-12 sm:pt-16">
        <div className="surface-card overflow-hidden p-7 sm:p-9">
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-zinc-900 sm:text-5xl">{uiText.landing.title}</h1>
          <p className="mt-4 max-w-2xl text-sm text-zinc-600 sm:text-base">
            {uiText.landing.description}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <LinkButton href={primaryHref} variant="primary" size="md">
              {primaryLabel}
            </LinkButton>
            <LinkButton href={secondaryHref} variant="secondary" size="md">
              {secondaryLabel}
            </LinkButton>
          </div>

          <div className="mt-8 grid gap-2 text-xs text-zinc-600 sm:grid-cols-3 sm:text-sm">
            {uiText.landing.highlights.map((highlight) => (
              <p key={highlight} className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-2">
                {highlight}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="content-shell grid gap-3 pb-20 sm:grid-cols-3">
        <article className="surface-card">
          <CardIcon path="M12 3v18M3 12h18" />
          <h2 className="mt-3 text-sm font-semibold text-zinc-900">{uiText.landing.steps[0].title}</h2>
          <p className="mt-2 text-xs text-zinc-600">{uiText.landing.steps[0].description}</p>
        </article>
        <article className="surface-card">
          <CardIcon path="M8 7h8M8 12h8M8 17h5M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
          <h2 className="mt-3 text-sm font-semibold text-zinc-900">{uiText.landing.steps[1].title}</h2>
          <p className="mt-2 text-xs text-zinc-600">{uiText.landing.steps[1].description}</p>
        </article>
        <article className="surface-card">
          <CardIcon path="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          <h2 className="mt-3 text-sm font-semibold text-zinc-900">{uiText.landing.steps[2].title}</h2>
          <p className="mt-2 text-xs text-zinc-600">{uiText.landing.steps[2].description}</p>
        </article>
      </section>
    </main>
  );
}
