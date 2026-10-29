// Where the sign-in email link and Continue with Google land. Exchanges the one-time token or code
// for a session cookie, links any earlier guest payment to the account, then sends the visitor on.
import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { safeNext } from "@/lib/redirect";
import { linkSubscriptions, saveSignupUtm } from "@/lib/server/account";
import { supabaseServer } from "@/lib/supabase/server";
import { readUtm } from "@/lib/utm";

const ALLOWED_TYPES: EmailOtpType[] = ["email", "magiclink", "signup"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const next = safeNext(params.get("next"));
  // Google (through Supabase) comes back with ?error=... when the person cancels or it fails.
  if (params.get("error") && !code) {
    console.error("google sign-in did not finish", params.get("error_code") ?? params.get("error"));
    return NextResponse.redirect(new URL("/sign-in?error=google", request.url));
  }
  const supabase = await supabaseServer();

  let user: { id: string; email?: string; created_at?: string } | null = null;
  let failure: string | undefined;
  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    // The token_hash link works on any device or mail app.
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    user = error ? null : data.user;
    failure = error?.code ?? error?.name;
  } else if (code) {
    // Continue with Google, and Supabase's default email link (same browser only).
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    user = error ? null : data.user;
    failure = error?.code ?? error?.name;
  } else {
    failure = "missing_token";
  }
  if (!user) console.error("sign-in link failed", failure);

  if (!user) return NextResponse.redirect(new URL("/sign-in?error=link", request.url));
  const signedIn = { id: user.id, email: (user.email ?? "").toLowerCase() };
  await linkSubscriptions(signedIn);
  if (code) await saveSignupUtm({ ...signedIn, created_at: user.created_at }, readUtm(params));
  return NextResponse.redirect(new URL(next, request.url));
}
