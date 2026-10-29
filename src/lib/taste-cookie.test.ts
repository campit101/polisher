import { describe, expect, it } from "vitest";
import { isTasteCookie, makeTasteCookie, TASTE_COOKIE, TASTE_COOKIE_MAX_AGE } from "./taste-cookie";

const secret = "unit-test-secret";

describe("the free-try cookie (Cam, 16 Oct: one free rewrite without signing in)", () => {
  it("is signed, so only this server's own cookie counts", () => {
    const value = makeTasteCookie(secret, new Date("2026-10-16T20:00:00Z"));
    expect(isTasteCookie(secret, value)).toBe(true);
    expect(isTasteCookie("another-secret", value)).toBe(false);
    expect(isTasteCookie(secret, value.replace(/.$/, (c) => (c === "0" ? "1" : "0")))).toBe(false);
  });

  it("refuses anything that is not one, including empty and missing values", () => {
    for (const bad of [undefined, "", "1", "abc.def", "1792180000000.", ".deadbeef"]) expect(isTasteCookie(secret, bad)).toBe(false);
  });

  it("has a fixed name and lasts a year", () => {
    expect(TASTE_COOKIE).toBe("polisher_taste");
    expect(TASTE_COOKIE_MAX_AGE).toBe(365 * 24 * 3600);
  });
});
