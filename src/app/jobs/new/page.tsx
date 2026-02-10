import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { JobEditorPage } from "@/components/job-editor/job-editor-page";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "New Job",
  description: "Create a scheduled AI prompt with delivery settings and preview.",
};

export default async function NewJobPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin?callbackUrl=/jobs/new");
  }

  return (
    <main className="page-shell">
      <SiteNav signedIn />
      <section className="content-shell max-w-3xl pt-6">
        <JobEditorPage />
      </section>
    </main>
  );
}
