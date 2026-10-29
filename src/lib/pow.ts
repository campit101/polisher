// A small proof-of-work bot check for the free rewrite without an account (R1). The server signs a
// random challenge; the browser must find a number whose SHA-256 with it starts with enough zero
// bits (about a second on a phone). It costs a script real time for every free rewrite it tries,
// needs no third-party service or keys, and sets no cookies. Each challenge is used once (the
// action records it) and expires after 10 minutes.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { leadingZeroBits } from "./pow-solve";

export { leadingZeroBits };

export const DIFFICULTY = 16;
const LIFETIME_MS = 10 * 60_000;

export type Challenge = { salt: string; expires: number; difficulty: number; sig: string };

const sign = (secret: string, salt: string, expires: number, difficulty: number) =>
  createHmac("sha256", `pow:${secret}`).update(`${salt}.${expires}.${difficulty}`).digest("hex");

export function createChallenge(secret: string, now = new Date(), difficulty = DIFFICULTY): Challenge {
  const salt = randomBytes(16).toString("hex");
  const expires = now.getTime() + LIFETIME_MS;
  return { salt, expires, difficulty, sig: sign(secret, salt, expires, difficulty) };
}

export function verifySolution(secret: string, challenge: Challenge, nonce: string, now = new Date()): boolean {
  if (!challenge || typeof challenge.salt !== "string" || !/^[0-9a-f]{32}$/.test(challenge.salt)) return false;
  if (typeof nonce !== "string" || !/^\d{1,12}$/.test(nonce)) return false;
  if (!Number.isInteger(challenge.expires) || challenge.expires < now.getTime()) return false;
  if (!Number.isInteger(challenge.difficulty) || challenge.difficulty < 1 || challenge.difficulty > 32) return false;
  const expected = Buffer.from(sign(secret, challenge.salt, challenge.expires, challenge.difficulty), "hex");
  const given = Buffer.from(typeof challenge.sig === "string" ? challenge.sig : "", "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  const digest = createHash("sha256").update(`${challenge.salt}:${nonce}`).digest();
  return leadingZeroBits(new Uint8Array(digest)) >= challenge.difficulty;
}
