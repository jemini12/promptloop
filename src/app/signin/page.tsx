import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { SiteNav } from "@/components/site-nav";
import { SignInButtons } from "@/components/signin-buttons";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to create, schedule, and manage your Promptly automation jobs.",
};

type Props = {
  searchParams: Promise<{ callbackUrl?: string }>;
};

export default async function SignInPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const signedIn = Boolean(session?.user?.id);
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/dashboard";

  if (signedIn) {
    redirect(callbackUrl);
  }

  return (
    <main className="page-shell">
      <SiteNav signedIn={signedIn} />
      <section className="content-shell flex min-h-[calc(100vh-57px)] items-center py-10">
        <div className="surface-card mx-auto w-full max-w-md">
          <h1 className="text-2xl font-semibold text-zinc-900">Sign in</h1>
          <p className="mt-1 text-sm text-zinc-500">Choose a social provider to access your scheduled jobs.</p>
          <div className="mt-4">
            <SignInButtons callbackUrl={callbackUrl} />
          </div>
        </div>
      </section>
    </main>
  );
}
