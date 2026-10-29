// Helpers for integration tests against the polisher-test Supabase project.
// Refuses to run against any other project, so tests can never touch production data.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const TEST_PROJECT_REF = "knjkgaldmvnelgqpxcsr";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing. Run npm run setup:secrets first.`);
  return value;
}

export const url = env("NEXT_PUBLIC_SUPABASE_URL");
if (new URL(url).hostname !== `${TEST_PROJECT_REF}.supabase.co`) {
  throw new Error(`Integration tests only run against the polisher-test project, not ${new URL(url).hostname}.`);
}
const publishableKey = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const secretKey = env("SUPABASE_SECRET_KEY");

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Server-side client (service_role). Bypasses RLS. */
export const admin = createClient(url, secretKey, noSession);

/** Signed-out browser client (anon). */
export const anon = () => createClient(url, publishableKey, noSession);

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

/** Creates a confirmed user and returns a browser client signed in as them (no email is sent). */
export async function createTestUser(metadata: Record<string, string> = {}): Promise<TestUser> {
  const email = `rls-${randomUUID().slice(0, 8)}+e2e@polisher.test`;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: metadata });
  if (created.error) throw created.error;

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;

  const client = anon();
  const signedIn = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "email" });
  if (signedIn.error) throw signedIn.error;

  return { id: created.data.user.id, email, client };
}

export async function deleteTestUser(user: TestUser | undefined): Promise<void> {
  if (!user) return;
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
}
