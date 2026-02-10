import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { SiteNav } from "@/components/site-nav";
import { SignInButtons } from "@/components/signin-buttons";
import { uiText } from "@/content/ui-text";

export const metadata: Metadata = {
  title: "Sign In",
  description: uiText.signIn.page.description,
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
          <h1 className="text-2xl font-semibold text-zinc-900">{uiText.signIn.page.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{uiText.signIn.page.description}</p>
          <div className="mt-4">
            <SignInButtons callbackUrl={callbackUrl} />
          </div>
        </div>
      </section>
    </main>
  );
}
