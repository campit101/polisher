import { describe, expect, it } from "vitest";
import { checkFormToken, createFormToken, hashIp, MIN_FILL_MS, parseWaitlistForm, rateLimitAddress } from "./waitlist";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe("parseWaitlistForm", () => {
  it("lower-cases the email and reads consent and UTMs", () => {
    expect(
      parseWaitlistForm(form({ email: "  Sam@Example.CO.UK ", marketing_consent: "yes", utm_source: "reddit" })),
    ).toEqual({ ok: true, value: { email: "sam@example.co.uk", marketingConsent: true, utm: { utm_source: "reddit" } } });
  });

  it("treats a missing tick box as no consent", () => {
    const result = parseWaitlistForm(form({ email: "sam@example.com" }));
    expect(result.ok && result.value.marketingConsent).toBe(false);
  });

  it("refuses a malformed email", () => {
    expect(parseWaitlistForm(form({ email: "sam@" })).ok).toBe(false);
    expect(parseWaitlistForm(form({})).ok).toBe(false);
  });

  it("refuses throwaway inboxes", () => {
    expect(parseWaitlistForm(form({ email: "x@mailinator.com" }))).toEqual({
      ok: false,
      message: "Use a permanent email address. Throwaway inboxes are not accepted.",
    });
  });
});

describe("form token", () => {
  const secret = "test-secret";
  const issued = 1_000_000;

  it("accepts a token used after the minimum fill time", () => {
    expect(checkFormToken(createFormToken(secret, issued), secret, issued + MIN_FILL_MS)).toBe("ok");
  });

  it("flags a form sent too fast", () => {
    expect(checkFormToken(createFormToken(secret, issued), secret, issued + 500)).toBe("too-fast");
  });

  it("rejects forged, expired or missing tokens", () => {
    expect(checkFormToken(`${issued}.deadbeef`, secret, issued + MIN_FILL_MS)).toBe("invalid");
    expect(checkFormToken(createFormToken("other", issued), secret, issued + MIN_FILL_MS)).toBe("invalid");
    expect(checkFormToken(createFormToken(secret, issued), secret, issued + 25 * 3_600_000)).toBe("invalid");
    expect(checkFormToken(null, secret)).toBe("invalid");
  });
});

describe("hashIp", () => {
  it("is stable for the same salt and differs across salts", () => {
    expect(hashIp("1.2.3.4", "a")).toBe(hashIp("1.2.3.4", "a"));
    expect(hashIp("1.2.3.4", "a")).not.toBe(hashIp("1.2.3.4", "b"));
    expect(hashIp("1.2.3.4", "a")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("rateLimitAddress (T11)", () => {
  it("keeps IPv4 addresses whole", () => {
    expect(rateLimitAddress("203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitAddress("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("groups IPv6 addresses by their /64 network, however they are written", () => {
    const network = "2001:db8:85a3:42";
    expect(rateLimitAddress("2001:db8:85a3:42:1:2:3:4")).toBe(`${network}::/64`);
    expect(rateLimitAddress("2001:0DB8:85a3:0042:ffff::1")).toBe(`${network}::/64`);
    expect(rateLimitAddress("2001:db8:85a3:42::")).toBe(`${network}::/64`);
    expect(rateLimitAddress("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(rateLimitAddress("::1")).toBe("0:0:0:0::/64");
  });

  it("leaves anything else as it is", () => {
    expect(rateLimitAddress("unknown")).toBe("unknown");
  });
});
