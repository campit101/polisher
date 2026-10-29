// What Polisher asks Stripe Checkout for. Pure, so it is unit tested; billing.ts sends it.
import type Stripe from "stripe";
import { billingCopy } from "@/content/billing";
import type { Utm } from "@/lib/utm";

export type CheckoutInput = { origin: string; priceId: string; user: { id: string; email: string } | null; utm: Utm };

// Managed Payments (Stripe as merchant of record, 3.5% a sale) is not used: Cam is not VAT registered
// and sells to UK adults only (DECISIONS 16 Oct). The live account turns it on by default for every
// Checkout Session, and it refuses custom_text, so each session switches it off (launch, 19 Oct).
// The Stripe library's types do not list this option yet, hence the explicit type.
type WithManagedPayments = Stripe.Checkout.SessionCreateParams & { managed_payments: { enabled: boolean } };

export function checkoutParams({ origin, priceId, user, utm }: CheckoutInput): WithManagedPayments {
  const metadata: Record<string, string> = { app: "polisher", ...utm, ...(user ? { user_id: user.id } : {}) };
  return {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    ...(user ? { customer_email: user.email, client_reference_id: user.id } : {}),
    metadata,
    subscription_data: { metadata },
    consent_collection: { terms_of_service: "required" },
    custom_text: {
      terms_of_service_acceptance: { message: billingCopy.checkout.terms(origin) },
      submit: { message: billingCopy.checkout.submit(origin) },
    },
    managed_payments: { enabled: false },
    locale: "en-GB",
    // Stripe fills in the session id, so /subscribed can save the payment without waiting for the webhook.
    success_url: `${origin}/subscribed?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#price`,
  };
}

export const PORTAL_TAG = "polisher-v1";

/**
 * The account-wide customer portal settings. Built from the configured site address, never from
 * request headers: the configuration is shared by every customer (audit, 29 Oct).
 */
export function portalConfigurationParams(siteUrl: string): Stripe.BillingPortal.ConfigurationCreateParams {
  return {
    metadata: { polisher: PORTAL_TAG },
    business_profile: { privacy_policy_url: `${siteUrl}/privacy`, terms_of_service_url: `${siteUrl}/terms` },
    features: {
      // Cancelling keeps access to the end of the paid month, as the terms say.
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      // Email changes are off: guest payments are linked to accounts by email.
      customer_update: { enabled: false },
      subscription_update: { enabled: false },
    },
  };
}
