"use server";

import { redirect } from "next/navigation";
import { billingCopy } from "@/content/billing";
import { hasBillingSubscription } from "@/lib/server/account";
import { createCheckout, createPortal, customerFor } from "@/lib/server/billing";
import { siteOrigin } from "@/lib/server/origin";
import { visitorHash, withinRateLimit } from "@/lib/server/visitor";
import { currentUser } from "@/lib/supabase/server";
import { readUtm } from "@/lib/utm";

export type BillingState = { message: string };

const failed: BillingState = { message: billingCopy.failed };

/** Sends the visitor to Stripe Checkout. Signed-in subscribers go to their account instead. */
export async function startCheckout(_previous: BillingState, form: FormData): Promise<BillingState> {
  const user = await currentUser();
  // Demo: checkout needs a demo account first, so Stripe gets its example.com address, never a real one.
  if (!user) redirect("/sign-in?next=/account");
  if (await hasBillingSubscription(user)) redirect("/account");
  if (!(await withinRateLimit(`checkout:${await visitorHash()}`, 3600, 10))) return failed;

  let url: string;
  try {
    url = await createCheckout(await siteOrigin(), user, readUtm(form));
  } catch (error) {
    console.error("checkout failed", error instanceof Error ? error.message : "unknown");
    return failed;
  }
  redirect(url);
}

/** Sends a subscriber to the Stripe customer portal to cancel, change card or get invoices. */
export async function openPortal(): Promise<BillingState> {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/account");
  const customer = await customerFor(user);
  if (!customer) return failed;

  let url: string;
  try {
    url = await createPortal(await siteOrigin(), customer);
  } catch (error) {
    console.error("portal failed", error instanceof Error ? error.message : "unknown");
    return failed;
  }
  redirect(url);
}
