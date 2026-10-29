import { describe, expect, it } from "vitest";
import { canStart, isAdmin } from "./admin";

const env = { ADMIN_EMAILS: "fakeowner0003@gmail.com, second@example.org" };

describe("isAdmin", () => {
  it("lets in listed addresses in any capitals", () => {
    expect(isAdmin("fakeowner0003@gmail.com", env)).toBe(true);
    expect(isAdmin("FakeOwner0003@Gmail.com", env)).toBe(true);
    expect(isAdmin("second@example.org", env)).toBe(true);
  });
  it("refuses everyone else, including look-alikes of the listed inbox", () => {
    expect(isAdmin("fake.someone0004@gmail.com", env)).toBe(false);
    expect(isAdmin("fakeowner0003+x@gmail.com", env)).toBe(false);
    expect(isAdmin("fake.owner0003@gmail.com", env)).toBe(false);
    expect(isAdmin("fakeowner0003@gmail.com.evil.com", env)).toBe(false);
  });
  it("refuses everyone when the allowlist is missing or empty", () => {
    expect(isAdmin("fakeowner0003@gmail.com", {})).toBe(false);
    expect(isAdmin("fakeowner0003@gmail.com", { ADMIN_EMAILS: "" })).toBe(false);
    expect(isAdmin("", { ADMIN_EMAILS: "," })).toBe(false);
    expect(isAdmin(null, env)).toBe(false);
  });
});

describe("canStart", () => {
  it("starts only when switched on, ticked and not started before", () => {
    expect(canStart({ launched: true, liveStripe: true, confirmed: true, alreadyStarted: false })).toEqual({ ok: true });
  });
  it("refuses a second run first of all", () => {
    expect(canStart({ launched: true, liveStripe: true, confirmed: true, alreadyStarted: true })).toEqual({ ok: false, reason: "alreadyStarted" });
  });
  it("refuses while the site is hidden", () => {
    expect(canStart({ launched: false, liveStripe: true, confirmed: true, alreadyStarted: false })).toEqual({ ok: false, reason: "notLaunched" });
  });
  it("refuses without the tick box", () => {
    expect(canStart({ launched: true, liveStripe: true, confirmed: false, alreadyStarted: false })).toEqual({ ok: false, reason: "notConfirmed" });
  });
  it("refuses while payments are still in Stripe test mode, so no real payment could be counted (T11)", () => {
    expect(canStart({ launched: true, liveStripe: false, confirmed: true, alreadyStarted: false })).toEqual({ ok: false, reason: "testPayments" });
  });
});
