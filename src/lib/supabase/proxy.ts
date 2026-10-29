// Refreshes the Supabase session cookie before signed-in pages render (Supabase's documented pattern).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieOptions } from "./cookies";

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [header, value] of Object.entries(headers ?? {})) response.headers.set(header, value);
      },
    },
  });

  // Nothing may run between creating the client and getClaims(), or sessions can drop at random.
  await supabase.auth.getClaims();
  return response;
}
