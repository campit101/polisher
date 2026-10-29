// Only same-site paths may be used as a "next" destination after sign-in (no open redirects).
// With no destination, people land on the Write page (Cam, 16 Oct).
export function safeNext(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/")) return fallback;
  // Browsers treat "//host" and "/\host" as another site.
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
