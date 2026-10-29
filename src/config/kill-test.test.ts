// Locks the kill-test numbers. If this fails, the thresholds were changed: put them back.
import { describe, expect, it } from "vitest";
import { killTest, verdict } from "./kill-test";

describe("kill-test thresholds", () => {
  it("are exactly the numbers approved on 12 October 2026", () => {
    expect(killTest).toEqual({
      windowHours: 240,
      pass: { minSignups: 100, minPaid: 5 },
      fail: { signupsBelow: 40, paidAtMost: 1 },
      blind: { pairs: 20, passWinsAtLeast: 14, stopWinsAtMost: 10 },
    });
  });

  it("cannot be changed while the site runs", () => {
    for (const part of [killTest, killTest.pass, killTest.fail, killTest.blind]) expect(Object.isFrozen(part)).toBe(true);
  });
});

describe("verdict", () => {
  it.each([
    [100, 5, "pass"],
    [250, 9, "pass"],
    [99, 5, "between"],
    [100, 4, "between"],
    [40, 2, "between"],
    [39, 5, "fail"],
    [39, 0, "fail"],
    [500, 1, "fail"],
    [500, 0, "fail"],
    [0, 0, "fail"],
  ] as const)("%i sign-ups and %i paid is %s", (signups, paid, expected) => {
    expect(verdict(signups, paid)).toBe(expected);
  });
});
