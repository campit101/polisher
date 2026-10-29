// The browser side of the free-rewrite bot check (R1): finds the number the server's challenge asks
// for. Plain Web Crypto, so it runs in any modern browser with nothing to install.

export function leadingZeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

export async function solveChallenge(salt: string, difficulty: number): Promise<string> {
  const encoder = new TextEncoder();
  for (let nonce = 0; nonce < 50_000_000; nonce++) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`${salt}:${nonce}`)));
    if (leadingZeroBits(digest) >= difficulty) return String(nonce);
  }
  throw new Error("no solution found");
}
