// The locked second free rewrite. The browser gets a masked preview (first sentence readable, the
// rest replaced by placeholders of the same length) and a sealed token. Only the server can open the
// token, only for the same account, and only within 24 hours. Nothing is stored. Rules: DECISIONS.md.

const PLACEHOLDER = "•";
const MAX_SHOWN = 300;

/**
 * The first sentence (or first line) as written, but never more than half the words, so a message
 * that is one long sentence stays locked (found in Cam's test, 16 Oct). Every other visible
 * character becomes a placeholder.
 */
export function maskPreview(text: string): string {
  const sentence = /^[\s\S]*?(?:[.!?]+["'”’)\]]*(?=\s|$)|\n)/.exec(text)?.[0] ?? text;
  let shown = sentence.endsWith("\n") ? sentence.slice(0, -1) : sentence;
  if (shown.length > MAX_SHOWN) {
    const cut = shown.slice(0, MAX_SHOWN);
    shown = cut.slice(0, Math.max(cut.lastIndexOf(" "), 0));
  }
  const half = Math.floor(text.split(/\s+/).filter(Boolean).length / 2);
  const words = shown.match(/\S+\s*/g) ?? [];
  if (words.length > half) shown = words.slice(0, half).join("").trimEnd();
  return shown + text.slice(shown.length).replace(/\S/gu, PLACEHOLDER);
}

const encoder = new TextEncoder();

async function keyFrom(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode("polisher"), info: encoder.encode("locked-rewrite-v1") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const LIFETIME_MS = 24 * 3_600_000;

/** Encrypts the real text (AES-GCM, key derived from a server-only secret) with the account and expiry inside. */
export async function sealLocked(secret: string, input: { userId: string; text: string; now: Date; lifetimeMs?: number }): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = JSON.stringify({ u: input.userId, exp: input.now.getTime() + (input.lifetimeMs ?? LIFETIME_MS), t: input.text });
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(secret), encoder.encode(payload)));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return toBase64Url(out);
}

/** The real text, or null if the token is expired, for another account, tampered with or not ours. */
export async function openLocked(secret: string, token: string, userId: string, now: Date): Promise<string | null> {
  const bytes = fromBase64Url(token);
  if (!bytes || bytes.length < 29) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await keyFrom(secret), bytes.slice(12));
    const payload = JSON.parse(new TextDecoder().decode(plain)) as { u?: unknown; exp?: unknown; t?: unknown };
    if (payload.u !== userId || typeof payload.exp !== "number" || now.getTime() > payload.exp || typeof payload.t !== "string") return null;
    return payload.t;
  } catch {
    return null;
  }
}
