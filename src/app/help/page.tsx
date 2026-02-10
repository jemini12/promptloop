import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { authOptions } from "@/lib/auth-options";
import { SiteNav } from "@/components/site-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Help",
  description: "Set up channels, preview jobs, and resolve common Promptly workflow issues.",
};

export default async function HelpPage() {
  const session = await getServerSession(authOptions);
  const signedIn = Boolean(session?.user?.id);

  return (
    <main className="page-shell">
      <SiteNav signedIn={signedIn} />
      <section className="content-shell max-w-4xl py-10">
        <h1 className="text-3xl font-semibold text-zinc-900">Help</h1>
        <p className="mt-2 text-sm text-zinc-600">Setup steps, channel requirements, and troubleshooting for reliable scheduled runs.</p>
        {!signedIn ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/signin?callbackUrl=/jobs/new" className="btn btn-primary btn-sm">
              Create Job
            </Link>
            <Link href="/signin?callbackUrl=/dashboard" className="btn btn-secondary btn-sm">
              View Dashboard
            </Link>
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          <section className="surface-card">
            <h2 className="text-sm font-semibold text-zinc-900">Quick start</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
              <li>Create a new job.</li>
              <li>Write your prompt and run preview.</li>
              <li>Set schedule and channel, then save.</li>
            </ol>
          </section>

          <section className="surface-card">
            <h2 className="text-sm font-semibold text-zinc-900">Channel setup</h2>
            <ul className="mt-2 space-y-2 text-sm text-zinc-700">
              <li>
                Discord: provide a webhook URL.
              </li>
              <li>
                Telegram: provide a bot token and chat ID.
              </li>
            </ul>
          </section>

          <section className="surface-card">
            <h2 className="text-sm font-semibold text-zinc-900">Preview and test-send</h2>
            <p className="mt-2 text-sm text-zinc-700">
              Run preview to validate output. Enable test-send to send preview output to the selected channel before saving.
            </p>
          </section>

          <section className="surface-card">
            <h2 className="text-sm font-semibold text-zinc-900">Common issues</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              <li>Unauthorized preview: sign in again and use the same host (`localhost`).</li>
              <li>Delivery error: verify the Discord webhook or Telegram bot/chat configuration.</li>
              <li>No scheduled sends: check job is enabled and worker process is running.</li>
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}
