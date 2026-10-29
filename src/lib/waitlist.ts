// Waitlist rules that need no database: form checks, the anti-bot timing token and IP hashing.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { parseEmail } from "@/lib/email";
import { readUtm, type Utm } from "@/lib/utm";
import { MIN_FILL_MS } from "@/lib/waitlist-fields";

const MAX_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;

export { HONEYPOT_FIELD, MIN_FILL_MS } from "@/lib/waitlist-fields";

export type WaitlistInput = { email: string; marketingConsent: boolean; utm: Utm };

export function parseWaitlistForm(form: FormData): { ok: true; value: WaitlistInput } | { ok: false; message: string } {
  const email = parseEmail(form.get("email"));
  if (!email.ok) return email;
  return {
    ok: true,
    value: { email: email.email, marketingConsent: form.get("marketing_consent") === "yes", utm: readUtm(form) },
  };
}

function sign(issuedAt: string, secret: string): string {
  return createHmac("sha256", secret).update(`waitlist:${issuedAt}`).digest("hex");
}

/** A signed timestamp put in the form when the page is rendered. */
export function createFormToken(secret: string, now = Date.now()): string {
  return `${now}.${sign(String(now), secret)}`;
}

export function checkFormToken(token: unknown, secret: string, now = Date.now()): "ok" | "too-fast" | "invalid" {
  if (typeof token !== "string") return "invalid";
  const [issuedAt = "", signature = ""] = token.split(".");
  const expected = Buffer.from(sign(issuedAt, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "invalid";
  const age = now - Number(issuedAt);
  if (!Number.isFinite(age) || age > MAX_TOKEN_AGE_MS || age < 0) return "invalid";
  return age < MIN_FILL_MS ? "too-fast" : "ok";
}

/** One-way hash of an IP address, so rate limits work without storing the address itself. */
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/**
 * The part of an address a rate limit counts. IPv4 is used whole. IPv6 is cut to its /64 network,
 * because one home or server is usually given a whole /64 and could otherwise rotate through
 * addresses to dodge every limit (T11).
 */
export function rateLimitAddress(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = ip.includes("::") ? (tail ? tail.split(":") : []) : [];
  const groups = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return ip;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
