// Supabase client with the secret key (service_role). Server code only: it bypasses RLS.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

let client: SupabaseClient | undefined;

export function supabaseAdmin(): SupabaseClient {
  client ??= createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
