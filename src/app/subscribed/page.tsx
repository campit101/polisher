import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { billingCopy } from "@/content/billing";
import { syncCheckout } from "@/lib/server/billing";
import { currentUser } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "../components/site-chrome";

export const metadata: Metadata = { title: billingCopy.subscribed.title };

// Stripe sends people here after paying, with the checkout's id. The payment is read from Stripe and
// saved straight away (the webhook saves it too, where Stripe can reach the site). Signed-in people
// go on to the Write page (Cam, 16 Oct); guests are asked to sign in with the email they paid with.
export default async function SubscribedPage({ searchParams }: PageProps<"/subscribed">) {
  const sessionId = (await searchParams).session_id;
  if (typeof sessionId === "string") {
    try {
      await syncCheckout(sessionId);
    } catch (error) {
      // The webhook still saves it; the page must not fail for the person who just paid.
      console.error("checkout sync failed", error instanceof Error ? error.message : "unknown");
    }
  }
  const user = await currentUser();
  if (user) redirect("/app?subscribed=1");

  const copy = billingCopy.subscribed;
  return (
    <>
      <SiteHeader onLanding={false} />
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pb-28 pt-24 text-center">
        <h1 className="title">{copy.heading}</h1>
        <p className="mt-4 text-lg text-fg-2">{copy.body}</p>
        <p className="mt-4 text-fg-2">{copy.guest}</p>
        <Link href="/sign-in?next=/app" className="btn btn-primary mt-8">
          {copy.signIn}
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
