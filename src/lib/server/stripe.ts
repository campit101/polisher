// Stripe client for server code. Test mode (sandbox) only, forever: Polisher is a portfolio demo.
import Stripe from "stripe";
import { assertTestModeKeys } from "@/lib/stripe-mode";
import { requireEnv } from "./env";

export { assertTestModeKeys, isTestModeKey, isTestPublishableKey } from "@/lib/stripe-mode";

let client: Stripe | undefined;

export function stripe(): Stripe {
  if (!client) {
    const key = requireEnv("STRIPE_SECRET_KEY");
    assertTestModeKeys(process.env);
    client = new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: "Polisher demo" } });
  }
  return client;
}
