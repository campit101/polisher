import { describe, expect, it } from "vitest";
import { assertTestModeKeys, isTestModeKey, isTestPublishableKey } from "./stripe";

describe("isTestModeKey", () => {
  it("accepts only test-mode secret and restricted keys", () => {
    expect(isTestModeKey("sk_test_abc")).toBe(true);
    expect(isTestModeKey("rk_test_abc")).toBe(true);
    expect(isTestModeKey("sk_live_abc")).toBe(false);
    expect(isTestModeKey("rk_live_abc")).toBe(false);
    expect(isTestModeKey("pk_test_abc")).toBe(false);
    expect(isTestModeKey("")).toBe(false);
  });
});

describe("isTestPublishableKey", () => {
  it("accepts only test-mode publishable keys", () => {
    expect(isTestPublishableKey("pk_test_abc")).toBe(true);
    expect(isTestPublishableKey("pk_live_abc")).toBe(false);
    expect(isTestPublishableKey("sk_test_abc")).toBe(false);
  });
});

describe("assertTestModeKeys (demo: Stripe test mode only, forever)", () => {
  it("passes with a test secret key and no publishable key", () => {
    expect(() => assertTestModeKeys({ STRIPE_SECRET_KEY: "sk_test_abc" })).not.toThrow();
    expect(() => assertTestModeKeys({ STRIPE_SECRET_KEY: "rk_test_abc", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_abc" })).not.toThrow();
  });

  it("refuses a live secret key, even with the old ALLOW_LIVE_STRIPE switch", () => {
    expect(() => assertTestModeKeys({ STRIPE_SECRET_KEY: "sk_live_abc" })).toThrow(/test mode only/);
    expect(() => assertTestModeKeys({ STRIPE_SECRET_KEY: "rk_live_abc", ALLOW_LIVE_STRIPE: "true" })).toThrow(/test mode only/);
  });

  it("refuses anything that is not a known test key prefix", () => {
    expect(() => assertTestModeKeys({ STRIPE_SECRET_KEY: "" })).toThrow();
    expect(() => assertTestModeKeys({ STRIPE_SECRET_KEY: "sk_abc" })).toThrow();
    expect(() => assertTestModeKeys({ STRIPE_SECRET_KEY: " sk_test_abc" })).toThrow();
  });

  it("refuses a live publishable key under either name", () => {
    expect(() => assertTestModeKeys({ STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_PUBLISHABLE_KEY: "pk_live_abc" })).toThrow(/test mode only/);
    expect(() => assertTestModeKeys({ STRIPE_SECRET_KEY: "sk_test_abc", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_abc" })).toThrow(/test mode only/);
  });

  it("allows a build with no Stripe key at all (the client is made only when used)", () => {
    expect(() => assertTestModeKeys({}, { requireSecret: false })).not.toThrow();
    expect(() => assertTestModeKeys({ STRIPE_SECRET_KEY: "sk_live_abc" }, { requireSecret: false })).toThrow();
  });
});
