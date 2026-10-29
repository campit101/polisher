// Polisher is a portfolio demo: Stripe runs in test mode (sandbox) only, forever. There is no switch
// to allow live keys. Plain TypeScript with no imports, so next.config.ts can refuse a live key at
// build time as well as the server refusing it at run time.

type Env = Record<string, string | undefined>;

/** True for Stripe test-mode secret or restricted keys. */
export function isTestModeKey(key: string): boolean {
  return key.startsWith("sk_test_") || key.startsWith("rk_test_");
}

/** True for Stripe test-mode publishable keys. */
export function isTestPublishableKey(key: string): boolean {
  return key.startsWith("pk_test_");
}

/**
 * Throws unless every Stripe key in the environment is a test-mode key. With requireSecret false
 * (the build), a missing secret key is allowed; a present one must still be a test key.
 */
export function assertTestModeKeys(env: Env, { requireSecret = true }: { requireSecret?: boolean } = {}): void {
  const secret = env.STRIPE_SECRET_KEY;
  if (secret === undefined ? requireSecret : !isTestModeKey(secret)) {
    throw new Error("STRIPE_SECRET_KEY must start sk_test_ or rk_test_. Polisher runs Stripe in test mode only.");
  }
  for (const name of ["STRIPE_PUBLISHABLE_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]) {
    const key = env[name];
    if (key !== undefined && !isTestPublishableKey(key)) {
      throw new Error(`${name} must start pk_test_. Polisher runs Stripe in test mode only.`);
    }
  }
}
