// Throwaway demo accounts: no email address of the visitor's, no email sent, gone after 24 hours.
// The account is made through the admin API (confirmed at once, so Supabase sends nothing) on an
// address at example.com, which the internet's rules reserve so that it never receives mail. The
// database deletes demo accounts after DEMO_LIFETIME_HOURS (migration demo_accounts).
import { randomBytes, randomUUID } from "node:crypto";

export const DEMO_EMAIL_DOMAIN = "example.com";
export const DEMO_LIFETIME_HOURS = 24;

const DEMO_EMAIL = /^demo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@example\.com$/;

export function isDemoEmail(email: string): boolean {
  return DEMO_EMAIL.test(email);
}

export function newDemoCredentials(): { email: string; password: string } {
  return { email: `demo-${randomUUID()}@${DEMO_EMAIL_DOMAIN}`, password: randomBytes(32).toString("base64url") };
}

type AdminAuth = {
  createUser(attrs: {
    email: string;
    password: string;
    email_confirm: boolean;
    user_metadata: Record<string, unknown>;
    app_metadata: Record<string, unknown>;
  }): Promise<{ error: { message: string } | null }>;
};

/** Makes one demo account and returns its sign-in details, or null when Supabase refuses. */
export async function createDemoAccount(admin: AdminAuth): Promise<{ email: string; password: string } | null> {
  const credentials = newDemoCredentials();
  const { error } = await admin.createUser({
    ...credentials,
    email_confirm: true,
    user_metadata: { demo: true },
    app_metadata: { demo: true },
  });
  if (error) {
    console.error("demo account failed", error.message);
    return null;
  }
  return credentials;
}
