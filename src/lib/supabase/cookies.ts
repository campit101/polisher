// Session cookie settings for both Supabase server clients. Nothing in the browser reads the
// session (Supabase is only called from the server), so page scripts never need to see it (T11).
import type { CookieOptionsWithName } from "@supabase/ssr";

export const sessionCookieOptions: CookieOptionsWithName = { httpOnly: true, secure: true, sameSite: "lax", path: "/" };
