// The kill-test pass and fail numbers, fixed before the test starts (approved plan, 12 October 2026).
// NEVER loosen these. src/config/kill-test.test.ts fails if any number changes.
export const killTest = Object.freeze({
  /** The test runs for exactly 240 hours, counted in UTC (the database works out the end time). */
  windowHours: 240,
  pass: Object.freeze({
    /** At least this many free-channel sign-ups... */
    minSignups: 100,
    /** ...AND at least this many paid subscriptions. */
    minPaid: 5,
  }),
  fail: Object.freeze({
    /** Fewer than this many sign-ups is a fail... */
    signupsBelow: 40,
    /** ...OR this many paid subscriptions or fewer. */
    paidAtMost: 1,
  }),
  /** Blind comparison (T9): Polisher must win this many of the pairs. */
  blind: Object.freeze({
    pairs: 20,
    passWinsAtLeast: 14,
    stopWinsAtMost: 10,
  }),
} as const);

export type Verdict = "pass" | "fail" | "between";

/** PASS, FAIL or BETWEEN (a written reason is needed before any decision). */
export function verdict(signups: number, paid: number): Verdict {
  if (signups >= killTest.pass.minSignups && paid >= killTest.pass.minPaid) return "pass";
  if (signups < killTest.fail.signupsBelow || paid <= killTest.fail.paidAtMost) return "fail";
  return "between";
}
