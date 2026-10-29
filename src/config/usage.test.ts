import { describe, expect, it } from "vitest";
import {
  callCostNano,
  chargedWords,
  checkCredits,
  checkFree,
  creditsOf,
  dayStart,
  freeLimitNano,
  globalDailyCapNano,
  nanoToUsd,
  nextDayStart,
  usage,
  usdToNano,
} from "./usage";

describe("agreed numbers (DECISIONS.md, Usage allowance and Launch direction)", () => {
  it("matches Cam's values", () => {
    // Demo (Cam, 29 Oct): Claude Haiku 5.5 inside a hard daily ceiling of about £0.10.
    expect(usage.model).toBe("claude-haiku-5-5");
    // Credits by the exact word (Cam, 16 Oct): 1 credit = 100 words, at least 50 words a rewrite.
    expect(usage.credits).toEqual({ monthly: 300, daily: 60, wordsPerCredit: 100, minWords: 50 });
    // 3 free rewrites, the last locked; free drafts up to 300 words; $0.04 an account at most.
    expect(usage.free).toEqual({ allowanceUsd: 0.04, maxRewrites: 3, shownRewrites: 2, draftMaxWords: 300 });
    // Demo: $0.13 a UTC day for everyone, test subscribers included ($0.13 is £0.097 at $1.34 to £1, 25 Oct 2026).
    expect(usage.globalFreeDailyCapUsd).toBe(0.13);
    expect(usage.globalDailyCapUsd).toBe(0.13);
    expect(usage.globalDailyCapUsd / 1.34).toBeLessThan(0.1);
    expect(usage.timeZone).toBe("Europe/London");
    expect(usage.lockedRewriteHours).toBe(24);
  });

  it("uses Haiku 5.5 prices (Claude API reference, cached 6 October 2026), five times higher past 100K tokens", () => {
    expect(usage.prices.standard).toEqual({ input: 0.1, cacheWrite5m: 0.125, cacheWrite1h: 0.2, cacheRead: 0.01, output: 0.5 });
    expect(usage.prices.longContext).toEqual({ input: 0.5, cacheWrite5m: 0.625, cacheWrite1h: 1, cacheRead: 0.05, output: 2.5 });
  });

  it("works out the limits in exact nano-dollars", () => {
    expect(freeLimitNano()).toBe(40_000_000);
    expect(globalDailyCapNano()).toBe(130_000_000);
    expect(nanoToUsd(freeLimitNano())).toBe(0.04);
    expect(usdToNano(0.002)).toBe(2_000_000);
  });
});

describe("callCostNano", () => {
  it("prices plain input and output", () => {
    // 1,000 x $0.10/M + 1,000 x $0.50/M = $0.0006
    expect(callCostNano({ input_tokens: 1000, output_tokens: 1000 })).toBe(600_000);
  });

  it("prices cache reads at a tenth and 5-minute cache writes at 1.25 times", () => {
    const cost = callCostNano({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1000, cache_creation_input_tokens: 1000 });
    expect(cost).toBe(1000 * 10 + 1000 * 125);
  });

  it("uses the 1-hour price when the API says the write was a 1-hour write", () => {
    const cost = callCostNano({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1000,
      cache_creation: { ephemeral_5m_input_tokens: 400, ephemeral_1h_input_tokens: 600 },
    });
    expect(cost).toBe(400 * 125 + 600 * 200);
  });

  it("prices Claude Sonnet 5.5 for comparisons only (Polisher's model 16 to 29 October)", () => {
    expect(usage.comparePrices["claude-sonnet-5-5"]).toEqual({ input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2, output: 10 });
    const u = { input_tokens: 1467, output_tokens: 1113, cache_read_input_tokens: 576, cache_creation_input_tokens: 428 };
    expect(callCostNano(u, "claude-sonnet-5-5")).toBe(1467 * 2000 + 1113 * 10_000 + 576 * 200 + 428 * 2500);
    // The default is Polisher's own model.
    expect(callCostNano(u)).toBe(callCostNano(u, usage.model));
    expect(callCostNano(u)).toBe(1467 * 100 + 1113 * 500 + 576 * 10 + 428 * 125);
  });

  it("refuses to price a model it has no prices for", () => {
    expect(() => callCostNano({ input_tokens: 1, output_tokens: 1 }, "claude-opus-5-5")).toThrow(/No prices/);
  });

  it("treats missing cache fields as zero", () => {
    expect(callCostNano({ input_tokens: 10, output_tokens: 0, cache_creation_input_tokens: null, cache_read_input_tokens: null, cache_creation: null })).toBe(1_000);
  });
});

describe("chargedWords", () => {
  it("charges the exact words, but at least 50 a rewrite", () => {
    expect(chargedWords(1)).toBe(50);
    expect(chargedWords(50)).toBe(50);
    expect(chargedWords(51)).toBe(51);
    expect(chargedWords(1000)).toBe(1000);
  });

  it("turns words into credits at 100 words a credit", () => {
    expect(creditsOf(50)).toBe(0.5);
    expect(creditsOf(123)).toBe(1.23);
    expect(creditsOf(30_000)).toBe(300);
  });
});

describe("checkCredits (in words)", () => {
  const day = 6000;
  const month = 30_000;
  it("allows a rewrite only when today's and this month's words both cover it", () => {
    expect(checkCredits(0, 0, 50)).toEqual({ allowed: true });
    expect(checkCredits(day - 50, month - 50, 50)).toEqual({ allowed: true });
  });

  it("stops at 60 credits (6,000 words) a day", () => {
    expect(checkCredits(day, day, 50)).toEqual({ allowed: false, limit: "daily" });
    expect(checkCredits(day - 100, day, 101)).toEqual({ allowed: false, limit: "daily" });
  });

  it("stops at 300 credits (30,000 words) a month even with words left today", () => {
    expect(checkCredits(0, month, 50)).toEqual({ allowed: false, limit: "monthly" });
    expect(checkCredits(0, month - 600, 601)).toEqual({ allowed: false, limit: "monthly" });
  });
});

describe("checkFree", () => {
  it("shows the first two free rewrites", () => {
    expect(checkFree(0, 0)).toEqual({ allowed: true, locked: false });
    expect(checkFree(1, 2_000_000)).toEqual({ allowed: true, locked: false });
  });

  it("runs the third free rewrite but locks it", () => {
    expect(checkFree(2, 4_000_000)).toEqual({ allowed: true, locked: true });
  });

  it("allows nothing after the third", () => {
    expect(checkFree(3, 0)).toEqual({ allowed: false });
    expect(checkFree(5, 0)).toEqual({ allowed: false });
  });

  it("stops when the free cost allowance is used, even before three rewrites", () => {
    expect(checkFree(2, freeLimitNano())).toEqual({ allowed: false });
    expect(checkFree(2, freeLimitNano() - 1)).toEqual({ allowed: true, locked: true });
  });
});

describe("daily reset at midnight in London", () => {
  it("starts the day at 23:00 UTC in British Summer Time", () => {
    expect(dayStart(new Date("2026-10-13T15:00:00Z")).toISOString()).toBe("2026-10-12T23:00:00.000Z");
    expect(nextDayStart(new Date("2026-10-13T15:00:00Z")).toISOString()).toBe("2026-10-13T23:00:00.000Z");
  });

  it("starts the day at 00:00 UTC in winter", () => {
    expect(dayStart(new Date("2026-12-10T08:30:00Z")).toISOString()).toBe("2026-12-10T00:00:00.000Z");
    expect(nextDayStart(new Date("2026-12-10T08:30:00Z")).toISOString()).toBe("2026-12-11T00:00:00.000Z");
  });

  it("handles the 25 October 2026 clock change: that day lasts 25 hours", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    const start = dayStart(now);
    const next = nextDayStart(now);
    expect(start.toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(next.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect((next.getTime() - start.getTime()) / 3_600_000).toBe(25);
  });

  it("handles the 29 March 2026 clock change: that day lasts 23 hours", () => {
    const now = new Date("2026-03-29T12:00:00Z");
    expect(dayStart(now).toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(nextDayStart(now).toISOString()).toBe("2026-03-29T23:00:00.000Z");
  });

  it("puts the last second before London midnight in the old day and midnight in the new one", () => {
    expect(dayStart(new Date("2026-10-24T22:59:59Z")).toISOString()).toBe("2026-10-23T23:00:00.000Z");
    expect(dayStart(new Date("2026-10-24T23:00:00Z")).toISOString()).toBe("2026-10-24T23:00:00.000Z");
  });

  it("is in the repeated 01:00 hour on 25 October still the same day", () => {
    // 01:30 BST and 01:30 GMT both fall on 25 October.
    expect(dayStart(new Date("2026-10-25T00:30:00Z")).toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(dayStart(new Date("2026-10-25T01:30:00Z")).toISOString()).toBe("2026-10-24T23:00:00.000Z");
  });
});
