import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { isPaidStatus, isPolisherSubscription, isStillBilling, paidCheckout, subscriptionIdFor, subscriptionRow } from "./billing";

const PRICE = "price_polisher";
const USER = "0b0e7d3c-5a3e-4b8e-9d64-2f1f3c0d9a11";

function sub(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    object: "subscription",
    customer: { id: "cus_1", object: "customer", email: "Pat@Example.co.uk" } as Stripe.Customer,
    status: "active",
    livemode: false,
    start_date: 1_791_900_000,
    canceled_at: null,
    cancel_at: null,
    cancel_at_period_end: false,
    metadata: { app: "polisher", user_id: USER, utm_source: "Reddit", utm_medium: "community", other: "x" },
    items: {
      object: "list",
      data: [
        {
          id: "si_1",
          price: { id: PRICE, unit_amount: 500, currency: "gbp" },
          current_period_start: 1_791_900_000,
          current_period_end: 1_794_578_400,
        } as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: "",
    },
    ...overrides,
  } as Stripe.Subscription;
}

const now = new Date("2026-10-13T16:00:00Z");

describe("subscriptionRow", () => {
  it("maps a Stripe subscription to the database row", () => {
    expect(subscriptionRow(sub(), {}, now)).toEqual({
      stripe_subscription_id: "sub_1",
      stripe_customer_id: "cus_1",
      stripe_price_id: PRICE,
      status: "active",
      livemode: false,
      amount_pence: 500,
      currency: "gbp",
      started_at: new Date(1_791_900_000_000).toISOString(),
      cancelled_at: null,
      cancel_at_period_end: false,
      current_period_start: new Date(1_791_900_000_000).toISOString(),
      current_period_end: new Date(1_794_578_400_000).toISOString(),
      utm_source: "reddit",
      utm_medium: "community",
      email: "pat@example.co.uk",
      user_id: USER,
      updated_at: now.toISOString(),
    });
  });

  it("prefers the email and account from the checkout over the customer record", () => {
    const row = subscriptionRow(sub(), { email: "Paid@Example.com", userId: "1c0e7d3c-5a3e-4b8e-9d64-2f1f3c0d9a22" }, now);
    expect(row.email).toBe("paid@example.com");
    expect(row.user_id).toBe("1c0e7d3c-5a3e-4b8e-9d64-2f1f3c0d9a22");
  });

  it("leaves out the email and account when unknown, so an update never wipes them", () => {
    const row = subscriptionRow(sub({ customer: "cus_1", metadata: {} }), {}, now);
    expect(row).not.toHaveProperty("email");
    expect(row).not.toHaveProperty("user_id");
    expect(row.stripe_customer_id).toBe("cus_1");
  });

  it("ignores an account id that is not a real id", () => {
    expect(subscriptionRow(sub({ metadata: { user_id: "'; drop table x; --" } }), {}, now)).not.toHaveProperty("user_id");
  });

  it("records cancelling at the end of the paid month, by flag or by end date", () => {
    expect(subscriptionRow(sub({ cancel_at_period_end: true }), {}, now).cancel_at_period_end).toBe(true);
    expect(subscriptionRow(sub({ cancel_at: 1_794_578_400 }), {}, now).cancel_at_period_end).toBe(true);
  });

  it("records a cancelled subscription", () => {
    const row = subscriptionRow(sub({ status: "canceled", canceled_at: 1_792_000_000 }), {}, now);
    expect(row.status).toBe("canceled");
    expect(row.cancelled_at).toBe(new Date(1_792_000_000_000).toISOString());
  });

  it("keeps the live-mode flag so test payments never count", () => {
    expect(subscriptionRow(sub({ livemode: true }), {}, now).livemode).toBe(true);
  });
});

describe("isPolisherSubscription", () => {
  it("accepts subscriptions made by Polisher's checkout or for its price", () => {
    expect(isPolisherSubscription(sub(), undefined)).toBe(true);
    expect(isPolisherSubscription(sub({ metadata: {} }), PRICE)).toBe(true);
  });

  it("ignores live-mode subscriptions: the demo runs Stripe in test mode only", () => {
    expect(isPolisherSubscription(sub({ livemode: true }), "price_other")).toBe(false);
  });

  it("ignores other subscriptions in the same Stripe account", () => {
    expect(isPolisherSubscription(sub({ metadata: {} }), "price_other")).toBe(false);
    expect(isPolisherSubscription(sub({ metadata: {} }), undefined)).toBe(false);
  });
});

describe("isPaidStatus", () => {
  it("gives the paid allowance only while Stripe treats the subscription as running", () => {
    expect(["active", "trialing", "past_due"].every(isPaidStatus)).toBe(true);
    expect(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"].some(isPaidStatus)).toBe(false);
  });
});

describe("isStillBilling", () => {
  it("counts as subscribed while Stripe may still charge, so the site offers managing, not a second subscription", () => {
    expect(["active", "trialing", "past_due", "unpaid"].every(isStillBilling)).toBe(true);
    expect(["canceled", "incomplete", "incomplete_expired", "paused"].some(isStillBilling)).toBe(false);
  });
});

describe("paidCheckout", () => {
  const session = (over: object) =>
    ({ mode: "subscription", status: "complete", metadata: { app: "polisher" }, subscription: "sub_1", customer_details: { email: "a@b.test" }, client_reference_id: "u1", ...over }) as unknown as Stripe.Checkout.Session;

  it("gives the subscription a finished Polisher checkout made, with who paid", () => {
    expect(paidCheckout(session({}))).toEqual({ subscriptionId: "sub_1", email: "a@b.test", userId: "u1" });
    expect(paidCheckout(session({ subscription: { id: "sub_2" }, client_reference_id: null }))).toEqual({ subscriptionId: "sub_2", email: "a@b.test", userId: null });
  });

  it("ignores checkouts that are unfinished, not Polisher's or not a subscription", () => {
    expect(paidCheckout(session({ status: "open" }))).toBeNull();
    expect(paidCheckout(session({ metadata: {} }))).toBeNull();
    expect(paidCheckout(session({ mode: "payment" }))).toBeNull();
    expect(paidCheckout(session({ subscription: null }))).toBeNull();
  });

  it("ignores live-mode checkouts: the demo runs Stripe in test mode only", () => {
    expect(paidCheckout(session({ livemode: true }))).toBeNull();
  });
});

describe("subscriptionIdFor", () => {
  const event = (type: string, object: object, livemode = false) => ({ type, livemode, data: { object } }) as unknown as Stripe.Event;

  it("ignores every live-mode event: the demo runs Stripe in test mode only", () => {
    expect(subscriptionIdFor(event("customer.subscription.updated", { id: "sub_1" }, true))).toBeNull();
  });

  it("finds the subscription behind each tracked event", () => {
    expect(subscriptionIdFor(event("checkout.session.completed", { mode: "subscription", subscription: "sub_1" }))).toBe("sub_1");
    expect(subscriptionIdFor(event("customer.subscription.updated", { id: "sub_2" }))).toBe("sub_2");
    expect(subscriptionIdFor(event("customer.subscription.deleted", { id: "sub_3" }))).toBe("sub_3");
    expect(subscriptionIdFor(event("invoice.paid", { parent: { subscription_details: { subscription: { id: "sub_4" } } } }))).toBe("sub_4");
  });

  it("ignores one-off payments and untracked events", () => {
    expect(subscriptionIdFor(event("checkout.session.completed", { mode: "payment", subscription: null }))).toBeNull();
    expect(subscriptionIdFor(event("invoice.paid", { parent: null }))).toBeNull();
    expect(subscriptionIdFor(event("customer.created", { id: "cus_1" }))).toBeNull();
  });
});
