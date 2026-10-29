// Who may see /admin, and when the one kill-test run may be started.

/**
 * True only for an address on the ADMIN_EMAILS allowlist, matched exactly apart from capitals.
 * Unlike the kill-test exclusions, plus tags and Gmail dots are not ignored here: access is strict.
 */
export function isAdmin(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!email) return false;
  const listed = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.includes("@"));
  return listed.includes(email.trim().toLowerCase());
}

export type StartCheck = { ok: true } | { ok: false; reason: "notLaunched" | "testPayments" | "notConfirmed" | "alreadyStarted" };

/**
 * The test can start once, only while the site is switched on and taking live payments (a test-mode
 * key would leave the paid count at 0), and only after the tick box.
 */
export function canStart({
  launched,
  liveStripe,
  confirmed,
  alreadyStarted,
}: {
  launched: boolean;
  liveStripe: boolean;
  confirmed: boolean;
  alreadyStarted: boolean;
}): StartCheck {
  if (alreadyStarted) return { ok: false, reason: "alreadyStarted" };
  if (!launched) return { ok: false, reason: "notLaunched" };
  if (!liveStripe) return { ok: false, reason: "testPayments" };
  if (!confirmed) return { ok: false, reason: "notConfirmed" };
  return { ok: true };
}
