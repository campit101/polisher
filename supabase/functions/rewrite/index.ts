// Edge Function "rewrite": called by the Next.js server with the signed-in user's session token.
// POST { action: "rewrite", draft, mode? } (mode "draft" or "notes", draft when missing) or
// { action: "unlock", token }; or, from the website's server only, { action: "taste", ... } (R1).
// The flow lives in ../_shared/rewrite/handler.ts; this file connects it to the database and the
// Anthropic API.
// Pinned to the version the website uses. No deno.json, so the version is written here.
// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { type Ai, type Deps, type FunctionRequest, handleRewrite, handleTaste, handleUnlock, parseRequest, type Store } from "../_shared/rewrite/handler.ts";
import { paidStatuses } from "../_shared/rewrite/limits.ts";
import type { ApiMessage } from "../_shared/rewrite/prompts.ts";
import { NANO_PER_USD } from "../_shared/usage.ts";

const secretKey: string = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

const toNano = (value: unknown) => Math.round(Number(value ?? 0) * NANO_PER_USD);
// Exact decimal text for numeric(14, 9) columns, so no floating-point rounding reaches the database.
const nanoToUsdText = (nano: number) => `${Math.floor(nano / NANO_PER_USD)}.${String(nano % NANO_PER_USD).padStart(9, "0")}`;

function must<T>(result: { data: T; error: { code?: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what} failed: ${result.error.code ?? "unknown"}`);
  return result.data;
}

const store: Store = {
  async aiMode() {
    const row = must(await db.from("app_settings").select("value").eq("key", "ai_mode").maybeSingle(), "ai mode");
    return row?.value === "mock" ? "mock" : "live";
  },
  async withinRateLimit(key, windowSeconds, max) {
    const { data, error } = await db.rpc("hit_rate_limit", { p_key: key, p_window_seconds: windowSeconds, p_max: max });
    // Fails closed: no answer from the database means no rewrite.
    return !error && data === true;
  },
  async samples(userId) {
    const rows = must(await db.from("writing_samples").select("body").eq("user_id", userId).order("created_at").order("id"), "samples");
    return (rows ?? []).map((r: { body: string }) => r.body);
  },
  async styleProfile(userId) {
    const row = must(await db.from("style_profiles").select("samples_hash, profile").eq("user_id", userId).maybeSingle(), "style profile");
    return row ? { hash: row.samples_hash, profile: row.profile } : null;
  },
  async saveStyleProfile(userId, hash, profile) {
    must(await db.from("style_profiles").upsert({ user_id: userId, samples_hash: hash, profile, updated_at: new Date().toISOString() }), "save style profile");
  },
  async paidPeriod(userId) {
    const row = must(
      await db
        .from("subscriptions")
        .select("started_at, current_period_start, current_period_end")
        .eq("user_id", userId)
        .in("status", [...paidStatuses])
        // A refunded payment loses the paid allowance straight away (the refund also cancels it).
        .is("refunded_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "subscription",
    );
    if (!row) return null;
    return { start: new Date(row.current_period_start ?? row.started_at), end: row.current_period_end ? new Date(row.current_period_end) : null };
  },
  async spentNano(userId, tier, since) {
    return toNano(must(await db.rpc("usage_spent", { p_user_id: userId, p_tier: tier, p_since: since.toISOString() }), "usage spent"));
  },
  async wordsCharged(userId, since) {
    return Number(must(await db.rpc("words_charged", { p_user_id: userId, p_since: since.toISOString() }), "words charged") ?? 0);
  },
  async globalSpentNano(since) {
    return toNano(must(await db.rpc("ai_spend_since", { p_since: since.toISOString() }), "global spend"));
  },
  async tierSpentNano(tier, since) {
    return toNano(must(await db.rpc("tier_spend_since", { p_tier: tier, p_since: since.toISOString() }), "tier spend"));
  },
  async reserveSpend(since, capNano, amountNano) {
    const id = must(await db.rpc("reserve_ai_spend", { p_since: since.toISOString(), p_cap_usd: nanoToUsdText(capNano), p_amount_usd: nanoToUsdText(amountNano) }), "reserve spend");
    return id === null ? null : Number(id);
  },
  async releaseSpend(id) {
    must(await db.rpc("release_ai_spend", { p_id: id }), "release spend");
  },
  async billedFailuresSince(userId, since) {
    const { count, error } = await db
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("outcome", "error")
      .gt("cost_usd", 0)
      .gte("created_at", since.toISOString());
    if (error) throw new Error(`billed failures failed: ${error.code ?? "unknown"}`);
    return count ?? 0;
  },
  async freeRewritesUsed(userId) {
    const row = must(await db.from("profiles").select("free_rewrites_used").eq("id", userId).maybeSingle(), "profile");
    return row?.free_rewrites_used ?? 0;
  },
  async claimFreeRewrite(userId, max) {
    const count = must(await db.rpc("claim_free_rewrite", { p_user_id: userId, p_max: max }), "claim free rewrite");
    return typeof count === "number" ? count : null;
  },
  async releaseFreeRewrite(userId) {
    must(await db.rpc("release_free_rewrite", { p_user_id: userId }), "release free rewrite");
  },
  async recordUsage(row) {
    // A failed record must not cost the user a rewrite they already paid for, so it is only logged.
    const { error } = await db.from("usage_events").insert(row);
    if (error) console.error("usage record failed", error.code);
  },
  async recordEvent(name) {
    const { error } = await db.from("events").insert({ name, path: "/app" });
    if (error) console.error("event record failed", error.code);
  },
};

const ai: Ai = async (body) => {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    console.error("anthropic error", response.status);
    throw new Error(`Anthropic answered ${response.status}`);
  }
  return (await response.json()) as ApiMessage;
};

const deps: Deps = { store, ai, lockSecret: secretKey, now: () => new Date() };

// The free taste (R1) has no account, so only the website's server may ask for it, with one of the
// project's secret keys, compared in constant time.
const secretKeys: string[] = [
  ...Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
].filter(Boolean);
function isServer(given: string): boolean {
  const a = new TextEncoder().encode(given);
  return secretKeys.some((key) => {
    const b = new TextEncoder().encode(key);
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
    return diff === 0;
  });
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ status: "error", reason: "method" }, 405);
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  // A taste carries up to 5 answers as well as the draft, so the body may be a little larger.
  const raw = await request.text();
  if (raw.length > 150_000) return json({ status: "error", reason: "too_long" }, 413);
  let input: FunctionRequest | null;
  try {
    input = parseRequest(JSON.parse(raw));
  } catch {
    input = null;
  }

  if (input?.action === "taste") {
    if (!isServer(token)) return json({ status: "error", reason: "signed_out" }, 401);
    try {
      return json(await handleTaste(deps, input));
    } catch (failure) {
      console.error("taste failed", failure instanceof Error ? failure.message : "unknown");
      return json({ status: "error", reason: "server" }, 500);
    }
  }

  // The function is deployed without the gateway's JWT check, so the session token is verified here.
  const { data, error } = await db.auth.getClaims(token);
  const userId = data?.claims?.sub;
  // Anonymous Supabase users also carry the authenticated role; only real accounts may rewrite.
  if (error || !userId || data?.claims?.role !== "authenticated" || data?.claims?.is_anonymous === true) return json({ status: "error", reason: "signed_out" }, 401);
  if (!input) return json({ status: "error", reason: "bad_request" }, 400);

  try {
    if (input.action === "rewrite") return json(await handleRewrite(deps, userId, input.draft, input.mode, input.kind, input.spelling));
    return json(await handleUnlock(deps, userId, input.token));
  } catch (failure) {
    console.error("rewrite failed", failure instanceof Error ? failure.message : "unknown");
    return json({ status: "error", reason: "server" }, 500);
  }
});
