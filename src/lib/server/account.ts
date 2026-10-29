// Account work that needs the secret key: linking payments, export and deletion.
import type { SignedInUser } from "@/lib/supabase/server";
import { utmForNewAccount } from "@/lib/oauth";
import type { Utm } from "@/lib/utm";
import { supabaseAdmin } from "./supabase-admin";

/** Statuses where Stripe will (or may) charge again, so the account must not be deleted yet.
 * A subscription already set to end at the close of the paid month will not charge again. */
const BILLING_STATUSES = ["active", "trialing", "past_due", "unpaid"];

/** Guest checkout stores payments by email; this attaches them once the person signs in. */
export async function linkSubscriptions(user: SignedInUser): Promise<void> {
  if (!user.email) return;
  const { error } = await supabaseAdmin()
    .from("subscriptions")
    .update({ user_id: user.id, updated_at: new Date().toISOString() })
    .eq("email", user.email)
    .is("user_id", null);
  if (error) console.error("link subscriptions failed", error.code);
}

/** Saves the campaign labels a Google sign-up arrived with (see utmForNewAccount). */
export async function saveSignupUtm(user: SignedInUser & { created_at?: string }, utm: Utm): Promise<void> {
  if (Object.keys(utm).length === 0 || !user.created_at) return;
  const db = supabaseAdmin();
  const { data } = await db.from("profiles").select("utm_source, utm_medium, utm_campaign").eq("id", user.id).maybeSingle();
  if (!data) return;
  const labels = utmForNewAccount(data, utm, user.created_at);
  if (!labels) return;
  const { error } = await db.from("profiles").update(labels).eq("id", user.id);
  if (error) console.error("saving sign-up labels failed", error.code);
}

export async function hasBillingSubscription(user: SignedInUser): Promise<boolean> {
  const billing = (column: "user_id" | "email", value: string) =>
    supabaseAdmin().from("subscriptions").select("id").eq(column, value).in("status", BILLING_STATUSES).eq("cancel_at_period_end", false).limit(1);
  const results = await Promise.all([billing("user_id", user.id), ...(user.email ? [billing("email", user.email)] : [])]);
  // If the check fails, treat it as billing so nothing is deleted by mistake.
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("billing check failed", failed.error.code);
    return true;
  }
  return results.some((r) => (r.data ?? []).length > 0);
}

/** The user's subscription rows, by account or by the email a guest paid with. Two plain equality
 * queries, never a filter string built from the email (T11). */
const EXPORT_COLUMNS =
  "stripe_subscription_id, email, status, amount_pence, currency, started_at, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, refunded_at, livemode";
async function subscriptionsFor(user: SignedInUser) {
  const db = supabaseAdmin();
  const [byId, byEmail] = await Promise.all([
    db.from("subscriptions").select(EXPORT_COLUMNS).eq("user_id", user.id),
    user.email ? db.from("subscriptions").select(EXPORT_COLUMNS).eq("email", user.email) : Promise.resolve({ data: [], error: null }),
  ]);
  const seen = new Set<string>();
  return [...(byId.data ?? []), ...(byEmail.data ?? [])].filter((row) => {
    if (seen.has(row.stripe_subscription_id)) return false;
    seen.add(row.stripe_subscription_id);
    return true;
  });
}

export type AccountName = { first_name: string; last_name: string };

/**
 * The optional name from Settings (Cam, 16 Oct), kept in the sign-in record's user metadata, so no
 * table changes. Read with the secret key, so a name saved a moment ago shows straight away.
 */
export async function accountName(user: SignedInUser): Promise<AccountName> {
  const { data, error } = await supabaseAdmin().auth.admin.getUserById(user.id);
  if (error) console.error("read name failed", error.code);
  const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return { first_name: text(meta.first_name), last_name: text(meta.last_name) };
}

export async function saveAccountName(user: SignedInUser, name: AccountName): Promise<boolean> {
  const { error } = await supabaseAdmin().auth.admin.updateUserById(user.id, { user_metadata: name });
  if (error) console.error("save name failed", error.code);
  return !error;
}

/** How the person signs in, and what Google passed on if they continued with Google (G1). */
async function signInDetails(user: SignedInUser) {
  const { data, error } = await supabaseAdmin().auth.admin.getUserById(user.id);
  if (error) console.error("read sign-in details failed", error.code);
  const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const text = (...values: unknown[]) => values.find((value): value is string => typeof value === "string" && value !== "") ?? null;
  const name = text(meta.full_name, meta.name);
  const picture = text(meta.avatar_url, meta.picture);
  return {
    methods: [...new Set((data?.user?.identities ?? []).map((identity) => identity.provider))].sort(),
    google: name || picture ? { name, picture } : null,
  };
}

/** Everything Polisher holds about the user, as one JSON-ready object. */
export async function exportAccount(user: SignedInUser) {
  const db = supabaseAdmin();
  const [name, signIn, profile, samples, style, subscriptions, waitlist, usage] = await Promise.all([
    accountName(user),
    signInDetails(user),
    db.from("profiles").select("email, utm_source, utm_medium, utm_campaign, free_rewrites_used, created_at").eq("id", user.id).maybeSingle(),
    db.from("writing_samples").select("body, word_count, created_at").eq("user_id", user.id).order("created_at"),
    db.from("style_profiles").select("profile, created_at, updated_at").eq("user_id", user.id).maybeSingle(),
    subscriptionsFor(user),
    db.from("waitlist").select("email, marketing_consent, consent_at, created_at").eq("email", user.email).maybeSingle(),
    db.from("usage_events").select("kind, tier, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, created_at").eq("user_id", user.id).order("created_at"),
  ]);
  return {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, name, sign_in_methods: signIn.methods, from_google: signIn.google },
    profile: profile.data,
    writing_samples: samples.data ?? [],
    voice_profile: style.data,
    subscriptions,
    waitlist: waitlist.data,
    usage: usage.data ?? [],
    not_stored: "Polisher does not save drafts or rewrites, so they are not in this file.",
  };
}

/** Deletes the account (samples, profile and voice profile cascade) and the waitlist entry. */
export async function deleteAccount(user: SignedInUser): Promise<boolean> {
  const db = supabaseAdmin();
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("delete user failed", error.code);
    return false;
  }
  await db.from("waitlist").delete().eq("email", user.email);
  return true;
}
