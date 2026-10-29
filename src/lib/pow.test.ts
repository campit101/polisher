import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createChallenge, leadingZeroBits, verifySolution } from "./pow";

const SECRET = "unit-test-secret";
const NOW = new Date("2026-10-15T20:00:00Z");

/** The same search the browser runs, done here with Node's hash. */
function solve(salt: string, difficulty: number): string {
  for (let nonce = 0; ; nonce++) {
    const digest = createHash("sha256").update(`${salt}:${nonce}`).digest();
    if (leadingZeroBits(new Uint8Array(digest)) >= difficulty) return String(nonce);
  }
}

describe("proof-of-work bot check for the free rewrite (R1)", () => {
  it("counts leading zero bits", () => {
    expect(leadingZeroBits(new Uint8Array([0, 0, 0x0f, 0xff]))).toBe(20);
    expect(leadingZeroBits(new Uint8Array([0x80]))).toBe(0);
  });

  it("accepts a correct solution to a fresh, signed challenge", () => {
    const challenge = createChallenge(SECRET, NOW, 8);
    expect(verifySolution(SECRET, challenge, solve(challenge.salt, 8), NOW)).toBe(true);
  });

  it("refuses a wrong answer, a tampered or expired challenge, and another secret", () => {
    const challenge = createChallenge(SECRET, NOW, 8);
    const nonce = solve(challenge.salt, 8);
    const wrong = [...Array(50).keys()].map(String).find((n) => n !== nonce && !verifySolution(SECRET, challenge, n, NOW));
    expect(verifySolution(SECRET, challenge, wrong!, NOW)).toBe(false);
    expect(verifySolution(SECRET, { ...challenge, difficulty: 1 }, nonce, NOW)).toBe(false);
    expect(verifySolution(SECRET, { ...challenge, salt: `${challenge.salt}x` }, nonce, NOW)).toBe(false);
    expect(verifySolution(SECRET, challenge, nonce, new Date(NOW.getTime() + 11 * 60_000))).toBe(false);
    expect(verifySolution("another-secret", challenge, nonce, NOW)).toBe(false);
  });

  it("refuses junk without throwing", () => {
    expect(verifySolution(SECRET, { salt: "", expires: 0, difficulty: 0, sig: "" }, "", NOW)).toBe(false);
    expect(verifySolution(SECRET, null as never, "1", NOW)).toBe(false);
  });
});
