// Supabase client for server code acting as the signed-in visitor (publishable key + their
// session cookie), so Row Level Security applies. For server-only work use supabaseAdmin().
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireEnv } from "@/lib/server/env";
import { sessionCookieOptions } from "./cookies";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components cannot set cookies; the proxy refreshes sessions instead.
        }
      },
    },
  });
}

export type SignedInUser = { id: string; email: string };

/** The verified signed-in user, or null. Reads and checks the session token (getClaims). */
export async function currentUser(): Promise<SignedInUser | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: String(claims.email ?? "").toLowerCase() };
}
