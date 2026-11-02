import { describe, expect, it } from "vitest";
import { isLaunched, site } from "./site";

describe("isLaunched", () => {
  it("is false when LAUNCHED is missing", () => {
    expect(isLaunched({})).toBe(false);
  });

  it("is false for anything other than the exact string true", () => {
    expect(isLaunched({ LAUNCHED: "TRUE" })).toBe(false);
    expect(isLaunched({ LAUNCHED: "1" })).toBe(false);
    expect(isLaunched({ LAUNCHED: "false" })).toBe(false);
  });

  it("is true only for the string true", () => {
    expect(isLaunched({ LAUNCHED: "true" })).toBe(true);
  });
});

describe("site facts", () => {
  it("matches the agreed price and refund window", () => {
    expect(site.pricePence).toBe(500);
    expect(site.priceLabel).toBe("£5 a month");
    expect(site.refundDays).toBe(30);
  });
});
