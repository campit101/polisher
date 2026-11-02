// Stripe webhook: checks the signature on the raw body, handles each event once, saves subscriptions.
import { alreadyHandled, handleStripeEvent, recordHandled } from "@/lib/server/billing";
import { requireEnv } from "@/lib/server/env";
import { stripe } from "@/lib/server/stripe";

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });
  const body = await request.text();

  let event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, signature, requireEnv("STRIPE_WEBHOOK_SECRET"));
  } catch {
    return new Response("bad signature", { status: 400 });
  }

  try {
    if (await alreadyHandled(event.id)) return Response.json({ received: true, duplicate: true });
    await handleStripeEvent(event);
    await recordHandled(event);
  } catch (error) {
    // A 500 makes Stripe try again later, so nothing is lost.
    console.error("stripe webhook failed", event.type, error instanceof Error ? error.message : "unknown");
    return new Response("failed", { status: 500 });
  }
  return Response.json({ received: true });
}
