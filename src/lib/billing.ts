// Turns a Stripe subscription into a row for the subscriptions table. Pure, so it is unit tested.
import type Stripe from "stripe";
import { readUtm } from "./utm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type SubscriptionRow = {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  stripe_price_id: string | null;
  status: string;
  livemode: boolean;
  amount_pence: number | null;
  currency: string | null;
  started_at: string;
  cancelled_at: string | null;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  email?: string;
  user_id?: string;
  updated_at: string;
};

const iso = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null);

/**
 * Ours if Polisher's checkout made it, or it is for Polisher's price. Other sandbox subscriptions are
 * ignored, and so is anything live: the demo runs Stripe in test mode only.
 */
export function isPolisherSubscription(sub: Stripe.Subscription, priceId: string | undefined): boolean {
  if (sub.livemode) return false;
  if (sub.metadata?.app === "polisher") return true;
  return !!priceId && sub.items.data.some((item) => item.price.id === priceId);
}

/**
 * Columns to upsert. The email and account link are only set when known, so a later event
 * without them never wipes them out.
 */
export function subscriptionRow(sub: Stripe.Subscription, known: { email?: string | null; userId?: string | null } = {}, now = new Date()): SubscriptionRow {
  const item = sub.items.data[0];
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const customerEmail = typeof sub.customer === "object" && !sub.customer.deleted ? sub.customer.email : null;
  const email = (known.email ?? customerEmail ?? "").trim().toLowerCase();
  const userId = known.userId ?? sub.metadata?.user_id ?? "";

  return {
    stripe_subscription_id: sub.id,
    stripe_customer_id: customer,
    stripe_price_id: item?.price.id ?? null,
    status: sub.status,
    livemode: sub.livemode,
    amount_pence: item?.price.unit_amount ?? null,
    currency: item?.price.currency ?? null,
    started_at: iso(sub.start_date) ?? now.toISOString(),
    cancelled_at: iso(sub.canceled_at),
    // A set end date (cancel_at) means the same thing to the user: it stops at the end.
    cancel_at_period_end: sub.cancel_at_period_end || sub.cancel_at !== null,
    current_period_start: iso(item?.current_period_start),
    current_period_end: iso(item?.current_period_end),
    ...readUtm(new URLSearchParams(Object.entries(sub.metadata ?? {}))),
    ...(email.includes("@") ? { email } : {}),
    ...(UUID.test(userId) ? { user_id: userId } : {}),
    updated_at: now.toISOString(),
  };
}

/** Statuses where the subscriber gets the paid allowance. */
export const PAID_STATUSES = ["active", "trialing", "past_due"] as const;

export function isPaidStatus(status: string): boolean {
  return (PAID_STATUSES as readonly string[]).includes(status);
}

/**
 * The subscription a finished Polisher checkout made, and who paid. Read when Stripe sends people
 * back to /subscribed, so a payment shows up even where Stripe's webhook cannot reach (previews).
 */
export function paidCheckout(session: Stripe.Checkout.Session): { subscriptionId: string; email: string | null; userId: string | null } | null {
  if (session.livemode || session.mode !== "subscription" || session.status !== "complete" || session.metadata?.app !== "polisher") return null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
  if (!subscriptionId) return null;
  return { subscriptionId, email: session.customer_details?.email ?? null, userId: session.client_reference_id ?? null };
}

/** Stripe may still charge these, so the next step is managing the plan, not subscribing again. */
export function isStillBilling(status: string): boolean {
  return isPaidStatus(status) || status === "unpaid";
}

/** The subscription a webhook event is about, or null for events Polisher does not track. */
export function subscriptionIdFor(event: Stripe.Event): string | null {
  // The demo runs Stripe in test mode only, so a live event is never acted on.
  if (event.livemode) return null;
  const ref = (value: string | { id: string } | null | undefined) => (typeof value === "string" ? value : (value?.id ?? null));
  switch (event.type) {
    case "checkout.session.completed":
      return event.data.object.mode === "subscription" ? ref(event.data.object.subscription) : null;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return event.data.object.id;
    case "invoice.paid":
      return ref(event.data.object.parent?.subscription_details?.subscription);
    default:
      return null;
  }
}
