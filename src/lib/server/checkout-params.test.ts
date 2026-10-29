import { siteUrlFrom } from "@/config/site";
import { describe, expect, it } from "vitest";
import { checkoutParams, portalConfigurationParams } from "./checkout-params";

const base = { origin: "https://trypolisher.vercel.app", priceId: "price_live", user: null, utm: {} };

describe("checkoutParams", () => {
  it("always switches Managed Payments off: the live account enables it by default and it refuses custom text (launch, 19 Oct)", () => {
    expect(checkoutParams(base)).toMatchObject({ managed_payments: { enabled: false } });
  });

  it("keeps the terms tick box, the custom text, British English and the return addresses", () => {
    const params = checkoutParams(base);
    expect(params).toMatchObject({
      mode: "subscription",
      line_items: [{ price: "price_live", quantity: 1 }],
      consent_collection: { terms_of_service: "required" },
      locale: "en-GB",
      success_url: "https://trypolisher.vercel.app/subscribed?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://trypolisher.vercel.app/#price",
      metadata: { app: "polisher" },
    });
    expect(JSON.stringify(params.custom_text)).toContain("https://trypolisher.vercel.app/terms");
  });

  it("links a signed-in account and fixes its email", () => {
    expect(checkoutParams({ ...base, user: { id: "u1", email: "a@b.co" } })).toMatchObject({ customer_email: "a@b.co", client_reference_id: "u1", metadata: { user_id: "u1" } });
  });
});

describe("portalConfigurationParams (audit, 29 Oct)", () => {
  it("builds the shared portal's links from the configured site address only", () => {
    const params = portalConfigurationParams(siteUrlFrom({ NEXT_PUBLIC_SITE_URL: "https://polisher-demo.vercel.app/" }));
    expect(params.business_profile).toEqual({
      privacy_policy_url: "https://polisher-demo.vercel.app/privacy",
      terms_of_service_url: "https://polisher-demo.vercel.app/terms",
    });
    expect(params.metadata).toEqual({ polisher: "polisher-v1" });
    expect(params.features?.customer_update).toEqual({ enabled: false });
  });
});
