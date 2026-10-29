// Stripe subscription: checkout and portal buttons, and the webhook with signed events about
// real objects in the Stripe sandbox (test mode). Nothing here can take real money.
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import Stripe from "stripe";
import { admin } from "../integration/supabase-test-project";
import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";
import { findUserByEmail, newEmail, signIn } from "./sign-in";

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) throw new Error("Billing tests need a Stripe test-mode key.");
const stripe = new Stripe(key);
const priceId = process.env.STRIPE_PRICE_ID ?? "";
const webhookSecret = process.env.E2E_STRIPE_WEBHOOK_SECRET ?? "";

const userIds: string[] = [];
const customerIds: string[] = [];
const eventIds: string[] = [];

test.beforeAll(async () => {
  await admin.from("rate_limits").delete().like("key", "checkout:%");
});

test.afterAll(async () => {
  await admin.from("rate_limits").delete().or("key.like.demo-ip:%,key.eq.demo-all");
  for (const id of customerIds) {
    await admin.from("subscriptions").delete().eq("stripe_customer_id", id);
    // Deleting a sandbox customer also cancels its subscriptions.
    await stripe.customers.del(id).catch(() => undefined);
  }
  if (eventIds.length > 0) await admin.from("stripe_events").delete().in("event_id", eventIds);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
});

/** A real sandbox subscription paid with Stripe's test card, as Checkout would make it. */
async function sandboxSubscription(email: string, metadata: Record<string, string> = {}, price = priceId) {
  const customer = await stripe.customers.create({ email });
  customerIds.push(customer.id);
  const card = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price }],
    default_payment_method: card.id,
    metadata,
  });
  return { customer, subscription };
}

/** Sends a signed event to the local webhook, the way Stripe would. */
async function deliver(page: Page, type: string, object: object, id = `evt_e2e_${randomUUID().replaceAll("-", "")}`) {
  eventIds.push(id);
  const payload = JSON.stringify({ id, object: "event", type, livemode: false, created: Math.floor(Date.now() / 1000), data: { object } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
  return page.request.post("/api/stripe/webhook", { data: payload, headers: { "stripe-signature": signature, "content-type": "application/json" } });
}

/** Stops the browser at Stripe's door: the test checks the address without loading Stripe's page. */
async function catchStripeRedirect(page: Page, host: string) {
  let reached = "";
  await page.route(`https://${host}/**`, (route) => {
    reached = route.request().url();
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Stripe</title><main>Stripe</main>" });
  });
  return () => reached;
}

test("webhook refuses requests without a valid Stripe signature", async ({ page }) => {
  const missing = await page.request.post("/api/stripe/webhook", { data: "{}" });
  expect(missing.status()).toBe(400);
  const forged = await page.request.post("/api/stripe/webhook", {
    data: JSON.stringify({ id: "evt_forged", type: "customer.subscription.created", data: { object: { id: "sub_x" } } }),
    headers: { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload: "{}", secret: "whsec_wrong" }) },
  });
  expect(forged.status()).toBe(400);
});

test("webhook saves a real sandbox subscription once, then tracks cancelling and refunds", async ({ page }) => {
  const email = newEmail("billing");
  const { customer, subscription } = await sandboxSubscription(email, { app: "polisher", utm_source: "reddit", utm_campaign: "launch" });

  const first = await deliver(page, "customer.subscription.created", { id: subscription.id });
  expect(first.status()).toBe(200);
  const { data: row } = await admin.from("subscriptions").select("*").eq("stripe_subscription_id", subscription.id).single();
  expect(row).toMatchObject({
    email,
    user_id: null,
    stripe_customer_id: customer.id,
    stripe_price_id: priceId,
    status: "active",
    livemode: false,
    amount_pence: 500,
    currency: "gbp",
    utm_source: "reddit",
    utm_campaign: "launch",
    cancel_at_period_end: false,
    refunded_at: null,
  });
  expect(new Date(row.current_period_end).getTime()).toBeGreaterThan(Date.now() + 27 * 86_400_000);

  // The same event delivered twice is handled once.
  const eventId = `evt_e2e_${randomUUID().replaceAll("-", "")}`;
  await deliver(page, "customer.subscription.updated", { id: subscription.id }, eventId);
  const again = await deliver(page, "customer.subscription.updated", { id: subscription.id }, eventId);
  expect(await again.json()).toEqual({ received: true, duplicate: true });

  // Cancelling in the portal sets cancel at period end; the next event records it.
  await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
  await deliver(page, "customer.subscription.updated", { id: subscription.id });
  const cancelled = await admin.from("subscriptions").select("cancel_at_period_end, status").eq("stripe_subscription_id", subscription.id).single();
  expect(cancelled.data).toEqual({ cancel_at_period_end: true, status: "active" });

  // A full refund marks the payment as refunded and, as the refund policy says, cancels the
  // subscription straight away (T11), so the paid allowance ends and nothing is charged again.
  await deliver(page, "charge.refunded", { id: "ch_e2e", object: "charge", customer: customer.id, refunded: true, created: Math.floor(Date.now() / 1000) });
  const refunded = await admin.from("subscriptions").select("refunded_at, status").eq("stripe_subscription_id", subscription.id).single();
  expect(refunded.data?.refunded_at).not.toBeNull();
  expect(refunded.data?.status).toBe("canceled");
  expect((await stripe.subscriptions.retrieve(subscription.id)).status).toBe("canceled");
});

test("a partial refund leaves the subscription running", async ({ page }) => {
  const { customer, subscription } = await sandboxSubscription(newEmail("billing"), { app: "polisher" });
  await deliver(page, "customer.subscription.created", { id: subscription.id });
  await deliver(page, "charge.refunded", { id: "ch_e2e_part", object: "charge", customer: customer.id, refunded: false, created: Math.floor(Date.now() / 1000) });
  const row = await admin.from("subscriptions").select("refunded_at, status").eq("stripe_subscription_id", subscription.id).single();
  expect(row.data).toEqual({ refunded_at: null, status: "active" });
  expect((await stripe.subscriptions.retrieve(subscription.id)).status).toBe("active");
});

test("checkout completed links the payment to the signed-in account that started it", async ({ page }) => {
  const user = await signIn(page, userIds, newEmail("billing"));
  const { subscription } = await sandboxSubscription(user.email);
  const response = await deliver(page, "checkout.session.completed", {
    id: "cs_test_e2e",
    object: "checkout.session",
    mode: "subscription",
    subscription: subscription.id,
    client_reference_id: user.id,
    customer_details: { email: user.email },
  });
  expect(response.status()).toBe(200);
  const { data } = await admin.from("subscriptions").select("user_id, status").eq("stripe_subscription_id", subscription.id).single();
  expect(data).toEqual({ user_id: user.id, status: "active" });

  await page.goto("/account");
  await expect(page.getByTestId("subscription")).toContainText("Active");
  await expect(page.getByTestId("subscription-date")).toContainText("Renews");
  await expect(page.getByTestId("usage-today")).toHaveText("100% left, 60/60 credits");
  await expect(page.getByTestId("usage-month")).toHaveText("100% left, 300/300 credits");
  await expect(page.getByTestId("subscribe")).toHaveCount(0);

  const reached = await catchStripeRedirect(page, "billing.stripe.com");
  await page.getByTestId("manage").click();
  await expect.poll(reached).toMatch(/^https:\/\/billing\.stripe\.com\//);
});

test("subscriptions for other products in the same Stripe account are ignored", async ({ page }) => {
  // Any other monthly price already in the sandbox (Stripe made a sample one when the sandbox was set up).
  const prices = await stripe.prices.list({ active: true, type: "recurring", limit: 20 });
  const other = prices.data.find((p) => p.id !== priceId);
  test.skip(!other, "No other recurring price in the sandbox to test with.");
  const { subscription } = await sandboxSubscription(newEmail("billing"), {}, other!.id);
  expect((await deliver(page, "customer.subscription.created", { id: subscription.id })).status()).toBe(200);
  const { data } = await admin.from("subscriptions").select("id").eq("stripe_subscription_id", subscription.id);
  expect(data).toEqual([]);
});

test("a free account can subscribe from the account page", async ({ page }) => {
  await signIn(page, userIds);
  await expect(page.getByTestId("free-usage")).toHaveText("Your first two rewrites are free. The third is made but locked until the demo checkout.");
  await expect(page.getByTestId("manage")).toHaveCount(0);
  await expectNoSeriousA11yIssues(page);
  const reached = await catchStripeRedirect(page, "checkout.stripe.com");
  await page.getByTestId("subscribe").click();
  await expect.poll(reached).toMatch(/^https:\/\/checkout\.stripe\.com\//);
});

test("a signed-out press of the price section's checkout button lands on sign-in, and a demo account can then reach Stripe's test checkout", async ({ page }) => {
  await admin.from("rate_limits").delete().or("key.like.demo-ip:%,key.eq.demo-all,key.like.checkout:%");
  await page.goto("/?utm_source=reddit");
  await page.locator("#price").getByTestId("subscribe").click();
  await expect(page).toHaveURL(/\/sign-in\?next=(%2F|\/)account$/);
  // No Stripe session was made for a visitor with no account.
  await page.getByTestId("start-demo").click();
  await expect(page).toHaveURL(/\/account$/, { timeout: 20_000 });
  const email = (await page.getByTestId("account-email").textContent()) ?? "";
  expect(email).toMatch(/@example\.com$/);
  const found = await findUserByEmail(email);
  userIds.push(found!.id);

  // Stop at Stripe's address: the page is answered here, nothing is paid.
  const reached = await catchStripeRedirect(page, "checkout.stripe.com");
  await page.getByTestId("subscribe").click();
  await expect.poll(reached).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  // The session Stripe made is a test-mode subscription for the demo address, with the demo wording.
  const sessions = await stripe.checkout.sessions.list({ limit: 5, created: { gte: Math.floor(Date.now() / 1000) - 60 } });
  const session = sessions.data.find((s) => s.url && reached().startsWith(s.url.split("#")[0] ?? s.url));
  expect(session).toBeDefined();
  expect(session?.livemode).toBe(false);
  expect(session?.id).toMatch(/^cs_test_/);
  expect(session?.metadata).toMatchObject({ app: "polisher", user_id: found!.id });
  expect(session?.mode).toBe("subscription");
  expect(session?.consent_collection?.terms_of_service).toBe("required");
  expect(session?.customer_email).toBe(email);
  await stripe.checkout.sessions.expire(session!.id).catch(() => undefined);
});

test("an account whose subscription ends at the close of the month can be deleted", async ({ page }) => {
  const user = await signIn(page, userIds);
  await admin.from("subscriptions").insert({
    email: user.email,
    user_id: user.id,
    stripe_customer_id: `cus_e2e_${randomUUID().slice(0, 8)}`,
    stripe_subscription_id: `sub_e2e_${randomUUID().slice(0, 8)}`,
    status: "active",
    cancel_at_period_end: true,
    livemode: false,
    started_at: new Date().toISOString(),
  });
  await page.reload();
  await page.getByLabel("I understand this cannot be undone").check();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/account-deleted$/);
  await admin.from("subscriptions").delete().eq("email", user.email);
});
