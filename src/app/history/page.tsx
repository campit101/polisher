import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { appCopy } from "@/content/app";
import { currentUser } from "@/lib/supabase/server";
import { HistoryList } from "../components/history-list";
import { SiteFooter, SiteHeader } from "../components/site-chrome";

export const metadata: Metadata = { title: appCopy.history.title };

// History (Cam, 16 Oct). The entries live in this browser only; the page needs the account so each
// person on a shared browser sees only their own.
export default async function HistoryPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/history");
  return (
    <>
      <SiteHeader onLanding={false} signedIn />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-28 pt-10">
        <h1 className="text-2xl font-semibold tracking-tight">{appCopy.history.title}</h1>
        <p className="mt-2 text-fg-2">{appCopy.history.intro}</p>
        <HistoryList userId={user.id} />
      </main>
      <SiteFooter />
    </>
  );
}
