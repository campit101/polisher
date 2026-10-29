// The free try without an account is one rewrite per browser (Cam, 16 Oct). After it works, the
// server sets this signed cookie, and a second free try from the same browser is refused even if the
// page's own memory is cleared. It holds only the time it was set and a signature, nothing personal.
import { createHmac, timingSafeEqual } from "node:crypto";

export const TASTE_COOKIE = "polisher_taste";
export const TASTE_COOKIE_MAX_AGE = 365 * 24 * 3600;

const sign = (secret: string, issuedAt: string) => createHmac("sha256", `taste:${secret}`).update(issuedAt).digest("hex");

export function makeTasteCookie(secret: string, now: Date = new Date()): string {
  const issuedAt = String(now.getTime());
  return `${issuedAt}.${sign(secret, issuedAt)}`;
}

/** True only for a cookie this server signed. */
export function isTasteCookie(secret: string, value: string | undefined): boolean {
  if (!value) return false;
  const [issuedAt, signature] = value.split(".");
  if (!issuedAt || !signature || !/^\d+$/.test(issuedAt) || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const given = Buffer.from(signature, "hex");
  const expected = Buffer.from(sign(secret, issuedAt), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
