// Stripe work that needs secret keys: checkout, the customer portal and webhook events.
import type Stripe from "stripe";
import { siteUrlFrom } from "@/config/site";
import { isPolisherSubscription, paidCheckout, subscriptionIdFor, subscriptionRow } from "@/lib/billing";
import type { Utm } from "@/lib/utm";
import { checkoutParams, PORTAL_TAG, portalConfigurationParams } from "./checkout-params";
import { requireEnv } from "./env";
import { stripe } from "./stripe";
import { supabaseAdmin } from "./supabase-admin";

/** Starts Stripe Checkout for the £5 monthly plan. Guests are allowed: Stripe collects their email. */
export async function createCheckout(origin: string, user: { id: string; email: string } | null, utm: Utm): Promise<string> {
  const session = await stripe().checkout.sessions.create(checkoutParams({ origin, priceId: requireEnv("STRIPE_PRICE_ID"), user, utm }));
  if (!session.url) throw new Error("Stripe did not return a checkout address");
  return session.url;
}

/** The portal settings Polisher needs, made once per Stripe account. */
async function portalConfiguration(): Promise<string> {
  const existing = await stripe().billingPortal.configurations.list({ active: true, limit: 100 });
  const ours = existing.data.find((c) => c.metadata?.polisher === PORTAL_TAG);
  if (ours) return ours.id;
  const created = await stripe().billingPortal.configurations.create(portalConfigurationParams(siteUrlFrom(process.env)));
  return created.id;
}

/** The Stripe customer behind the user's newest subscription, if any. */
export async function customerFor(user: { id: string; email: string }): Promise<string | null> {
  // Two plain equality queries, never a filter string built from the email (T11).
  const newest = (column: "user_id" | "email", value: string) =>
    supabaseAdmin().from("subscriptions").select("stripe_customer_id, started_at").eq(column, value).order("started_at", { ascending: false }).limit(1).maybeSingle();
  const results = await Promise.all([newest("user_id", user.id), newest("email", user.email)]);
  for (const r of results) if (r.error) console.error("customer lookup failed", r.error.code);
  const rows = results.map((r) => r.data).filter((row) => row !== null);
  rows.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  return rows[0]?.stripe_customer_id ?? null;
}

export async function createPortal(origin: string, customer: string): Promise<string> {
  const session = await stripe().billingPortal.sessions.create({
    customer,
    configuration: await portalConfiguration(),
    return_url: `${origin}/account`,
  });
  return session.url;
}

/**
 * Reads the subscription fresh from Stripe and saves it. Events can arrive in any order or
 * twice; reading the current state each time makes every delivery give the same result.
 */
async function syncSubscription(id: string, known: { email?: string | null; userId?: string | null }): Promise<void> {
  const sub = await stripe().subscriptions.retrieve(id, { expand: ["customer"] });
  if (!isPolisherSubscription(sub, process.env.STRIPE_PRICE_ID)) return;
  const row = subscriptionRow(sub, known);
  const db = supabaseAdmin();

  // Link to an account straight away when someone has already signed up with this email.
  if (!row.user_id && row.email) {
    const { data } = await db.from("profiles").select("id").eq("email", row.email).maybeSingle();
    if (data?.id) row.user_id = data.id;
  }

  let { error } = await (row.email
    ? db.from("subscriptions").upsert(row, { onConflict: "stripe_subscription_id" })
    : db.from("subscriptions").update(row).eq("stripe_subscription_id", row.stripe_subscription_id));
  // The account named in the checkout no longer exists: save the payment without the link.
  if (error?.code === "23503" && row.user_id) {
    delete row.user_id;
    ({ error } = await db.from("subscriptions").upsert(row, { onConflict: "stripe_subscription_id" }));
  }
  if (error) throw new Error(`subscription save failed: ${error.code}`);
}

/**
 * A full refund marks the customer's subscription as refunded (kill-test results leave it out) and
 * cancels it straight away, as the refund policy says, so nothing is charged again. Stripe sets
 * `refunded` only once the whole charge is refunded, so partial refunds change nothing.
 */
async function markRefunded(charge: Stripe.Charge): Promise<void> {
  if (!charge.refunded) return;
  const customer = typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  if (!customer) return;
  const db = supabaseAdmin();
  const { error } = await db
    .from("subscriptions")
    .update({ refunded_at: new Date((charge.created ?? Date.now() / 1000) * 1000).toISOString(), updated_at: new Date().toISOString() })
    .eq("stripe_customer_id", customer)
    .is("refunded_at", null);
  if (error) throw new Error(`refund save failed: ${error.code}`);

  const { data: running, error: readError } = await db
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("stripe_customer_id", customer)
    .not("status", "in", "(canceled,incomplete_expired)");
  if (readError) throw new Error(`refund cancel lookup failed: ${readError.code}`);
  for (const { stripe_subscription_id: id } of running ?? []) {
    const sub = await stripe().subscriptions.retrieve(id);
    if (sub.status !== "canceled" && sub.status !== "incomplete_expired") await stripe().subscriptions.cancel(id);
    await syncSubscription(id, {});
  }
}

/**
 * Saves the subscription behind a finished checkout, read from Stripe itself. Called when Stripe
 * sends the person back to /subscribed. The session id only lets Stripe's own answer be saved, so a
 * guessed or reused id can do nothing more than the webhook would. Returns true when one was saved.
 */
export async function syncCheckout(sessionId: string): Promise<boolean> {
  if (!/^cs_test_[A-Za-z0-9]{1,200}$/.test(sessionId)) return false;
  const paid = paidCheckout(await stripe().checkout.sessions.retrieve(sessionId));
  if (!paid) return false;
  await syncSubscription(paid.subscriptionId, { email: paid.email, userId: paid.userId });
  return true;
}

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "charge.refunded",
] as const;

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (event.type === "charge.refunded") return markRefunded(event.data.object);
  const id = subscriptionIdFor(event);
  if (!id) return;
  const known =
    event.type === "checkout.session.completed"
      ? { email: event.data.object.customer_details?.email, userId: event.data.object.client_reference_id }
      : {};
  await syncSubscription(id, known);
}

/** True if this event was already handled (Stripe can send the same event more than once). */
export async function alreadyHandled(eventId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().from("stripe_events").select("event_id").eq("event_id", eventId).maybeSingle();
  if (error) throw new Error(`event lookup failed: ${error.code}`);
  return !!data;
}

export async function recordHandled(event: Stripe.Event): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("stripe_events")
    .upsert({ event_id: event.id, type: event.type, livemode: event.livemode }, { onConflict: "event_id", ignoreDuplicates: true });
  if (error) throw new Error(`event record failed: ${error.code}`);
}
