// Talks to the "rewrite" Edge Function as the signed-in user, and works out the usage bars.
import { type FunctionRequest, type Mode, paidView, type RewriteResult, type TasteResult, type UnlockResult, type UsageView } from "../../../supabase/functions/_shared/rewrite/handler.ts";
import { dayStart, usage } from "@/config/usage";
import { PAID_STATUSES } from "@/lib/billing";
import { supabaseServer, type SignedInUser } from "@/lib/supabase/server";
import { requireEnv } from "./env";
import { supabaseAdmin } from "./supabase-admin";

export type { Mode, RewriteResult, TasteResult, UnlockResult, UsageView };

export type FunctionError = { status: "error"; reason: "signed_out" | "server" };

/** Calls the Edge Function with the user's own session token; the function checks it again. */
export async function callRewriteFunction<T>(body: FunctionRequest): Promise<T | FunctionError> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { status: "error", reason: "signed_out" };
  try {
    const response = await fetch(`${requireEnv("NEXT_PUBLIC_SUPABASE_URL")}/functions/v1/rewrite`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });
    if (response.status === 401) return { status: "error", reason: "signed_out" };
    const result = (await response.json()) as T;
    return result;
  } catch (error) {
    console.error("rewrite function call failed", error instanceof Error ? error.name : "unknown");
    return { status: "error", reason: "server" };
  }
}

/**
 * The free taste (R1): no account, so this server calls the function with the project's secret key,
 * only after its own bot check and per-connection limits.
 */
export async function callTasteFunction(body: Extract<FunctionRequest, { action: "taste" }>): Promise<TasteResult | FunctionError> {
  try {
    const response = await fetch(`${requireEnv("NEXT_PUBLIC_SUPABASE_URL")}/functions/v1/rewrite`, {
      method: "POST",
      headers: { authorization: `Bearer ${requireEnv("SUPABASE_SECRET_KEY")}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
      cache: "no-store",
    });
    if (!response.ok) return { status: "error", reason: "server" };
    return (await response.json()) as TasteResult;
  } catch (error) {
    console.error("taste function call failed", error instanceof Error ? error.name : "unknown");
    return { status: "error", reason: "server" };
  }
}

/** The usage bars for the account and app pages, worked out the same way as the Edge Function. */
export async function usageSummary(user: SignedInUser, now = new Date()): Promise<UsageView> {
  const db = supabaseAdmin();
  const { data: sub } = await db
    .from("subscriptions")
    .select("started_at, current_period_start, current_period_end")
    .eq("user_id", user.id)
    .in("status", [...PAID_STATUSES])
    .is("refunded_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub) {
    const { data: profile } = await db.from("profiles").select("free_rewrites_used").eq("id", user.id).maybeSingle();
    return { tier: "free", used: profile?.free_rewrites_used ?? 0, max: usage.free.maxRewrites, shown: usage.free.shownRewrites };
  }
  // Words charged (credits by the word, 16 Oct), summed the same way as the Edge Function.
  const used = async (since: Date) => Number((await db.rpc("words_charged", { p_user_id: user.id, p_since: since.toISOString() })).data ?? 0);
  const [today, month] = await Promise.all([used(dayStart(now)), used(new Date(sub.current_period_start ?? sub.started_at))]);
  return paidView(now, today, month, sub.current_period_end ? new Date(sub.current_period_end) : null);
}
