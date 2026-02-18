import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { SiteNav } from "@/components/site-nav";
import { JobBuilderChatClient } from "@/components/chat/job-builder-chat-client";

export const metadata: Metadata = {
  title: "Job Builder",
  description: "Chat to create a new job.",
};

export default async function ChatPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/signin?callbackUrl=/chat");
  }

  return (
    <main className="page-shell">
      <SiteNav signedIn />
      <JobBuilderChatClient />
    </main>
  );
}
