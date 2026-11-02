import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Only pages that use the session. Public pages stay static and untouched.
export const config = {
  matcher: ["/account/:path*", "/sign-in", "/app/:path*", "/history", "/admin/:path*", "/api/session"],
};
