// Row Level Security and grants, tested through the real Data API of the polisher-test project.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, createTestUser, deleteTestUser, type TestUser } from "./supabase-test-project";

const ALL_TABLES = [
  "profiles",
  "waitlist",
  "writing_samples",
  "style_profiles",
  "subscriptions",
  "stripe_events",
  "usage_events",
  "rate_limits",
  "kill_test_runs",
  "blind_pairs",
  "events",
  "app_settings",
];
const SERVER_ONLY_TABLES = ALL_TABLES.filter(
  (t) => !["profiles", "writing_samples", "style_profiles", "subscriptions"].includes(t),
);

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  alice = await createTestUser({ utm_source: "reddit", utm_medium: "community", utm_campaign: "launch" });
  bob = await createTestUser();
});

afterAll(async () => {
  await admin.from("subscriptions").delete().like("stripe_subscription_id", "sub_rlstest_%");
  await deleteTestUser(alice);
  await deleteTestUser(bob);
});

describe("anon (signed out)", () => {
  it.each(ALL_TABLES)("cannot read %s", async (table) => {
    const { data, error } = await anon().from(table).select("*").limit(1);
    expect(error?.code, `anon read ${table} returned ${JSON.stringify(data)}`).toBe("42501");
  });

  it("cannot call the rate limit function", async () => {
    const { error } = await anon().rpc("hit_rate_limit", { p_key: "x", p_window_seconds: 60, p_max: 1 });
    expect(error).not.toBeNull();
  });

  it("cannot call the usage ledger functions", async () => {
    const since = new Date(0).toISOString();
    expect((await anon().rpc("usage_spent", { p_user_id: alice.id, p_tier: "paid", p_since: since })).error).not.toBeNull();
    expect((await anon().rpc("ai_spend_since", { p_since: since })).error).not.toBeNull();
    expect((await anon().rpc("tier_spend_since", { p_tier: "free", p_since: since })).error).not.toBeNull();
    expect((await anon().rpc("words_charged", { p_user_id: alice.id, p_since: since })).error).not.toBeNull();
  });

  it("cannot claim or give back free rewrites", async () => {
    expect((await anon().rpc("claim_free_rewrite", { p_user_id: alice.id, p_max: 2 })).error).not.toBeNull();
    expect((await anon().rpc("release_free_rewrite", { p_user_id: alice.id })).error).not.toBeNull();
  });
});

describe("signed-in users", () => {
  it.each(SERVER_ONLY_TABLES)("cannot read the server-only table %s", async (table) => {
    const { error } = await alice.client.from(table).select("*").limit(1);
    expect(error?.code).toBe("42501");
  });

  it("get a profile made automatically, with their sign-up labels", async () => {
    const { data, error } = await alice.client.from("profiles").select("*");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      id: alice.id,
      email: alice.email,
      utm_source: "reddit",
      utm_medium: "community",
      utm_campaign: "launch",
      free_rewrites_used: 0,
    });
  });

  it("cannot change their own profile, such as resetting free rewrites", async () => {
    const { error } = await alice.client.from("profiles").update({ free_rewrites_used: 0 }).eq("id", alice.id);
    expect(error?.code).toBe("42501");
  });

  it("cannot see another user's profile", async () => {
    const { data } = await bob.client.from("profiles").select("*").eq("id", alice.id);
    expect(data).toEqual([]);
  });

  it("cannot call the rate limit function", async () => {
    const { error } = await alice.client.rpc("hit_rate_limit", { p_key: "x", p_window_seconds: 60, p_max: 1 });
    expect(error).not.toBeNull();
  });

  it("cannot read usage totals, even their own", async () => {
    const since = new Date(0).toISOString();
    expect((await alice.client.rpc("usage_spent", { p_user_id: alice.id, p_tier: "paid", p_since: since })).error).not.toBeNull();
    expect((await alice.client.rpc("ai_spend_since", { p_since: since })).error).not.toBeNull();
    expect((await alice.client.rpc("tier_spend_since", { p_tier: "free", p_since: since })).error).not.toBeNull();
    expect((await alice.client.rpc("words_charged", { p_user_id: alice.id, p_since: since })).error).not.toBeNull();
  });

  it("cannot claim or give back free rewrites, even their own", async () => {
    expect((await alice.client.rpc("claim_free_rewrite", { p_user_id: alice.id, p_max: 99 })).error).not.toBeNull();
    expect((await alice.client.rpc("release_free_rewrite", { p_user_id: alice.id })).error).not.toBeNull();
  });
});

describe("writing samples", () => {
  let sampleId: string;

  beforeAll(async () => {
    const { data, error } = await alice.client
      .from("writing_samples")
      .insert({ body: "Right then, here is how I write." })
      .select()
      .single();
    if (error) throw error;
    sampleId = data.id;
  });

  it("are owned by the signer and word-counted by the database", async () => {
    const { data } = await alice.client.from("writing_samples").select("user_id, word_count").eq("id", sampleId).single();
    expect(data).toEqual({ user_id: alice.id, word_count: 7 });
  });

  it("are invisible to another user", async () => {
    const { data } = await bob.client.from("writing_samples").select("*").eq("id", sampleId);
    expect(data).toEqual([]);
  });

  it("cannot be changed or deleted by another user", async () => {
    const updated = await bob.client.from("writing_samples").update({ body: "hijacked" }).eq("id", sampleId).select();
    expect(updated.data).toEqual([]);
    const deleted = await bob.client.from("writing_samples").delete().eq("id", sampleId).select();
    expect(deleted.data).toEqual([]);
    const { data } = await alice.client.from("writing_samples").select("body").eq("id", sampleId).single();
    expect(data?.body).toBe("Right then, here is how I write.");
  });

  it("cannot be created for another user", async () => {
    const { error } = await bob.client.from("writing_samples").insert({ body: "planted", user_id: alice.id });
    expect(error?.code).toBe("42501");
  });

  it("cannot be handed to another user", async () => {
    const { error } = await alice.client.from("writing_samples").update({ user_id: bob.id }).eq("id", sampleId);
    expect(error?.code).toBe("42501");
  });

  it("can be edited and deleted by their owner", async () => {
    const updated = await alice.client.from("writing_samples").update({ body: "Edited, two words more." }).eq("id", sampleId).select("word_count").single();
    expect(updated.data?.word_count).toBe(4);
  });

  it("stop at 5 per user", async () => {
    const more = Array.from({ length: 4 }, (_, i) => ({ body: `Sample number ${i + 2}.` }));
    const ok = await alice.client.from("writing_samples").insert(more);
    expect(ok.error).toBeNull();
    const sixth = await alice.client.from("writing_samples").insert({ body: "One too many." });
    expect(sixth.error?.message).toContain("sample limit reached");

    const { count } = await alice.client.from("writing_samples").select("*", { count: "exact", head: true });
    expect(count).toBe(5);
    const removed = await alice.client.from("writing_samples").delete().eq("id", sampleId).select();
    expect(removed.data).toHaveLength(1);
  });
});

describe("subscriptions", () => {
  beforeAll(async () => {
    const { error } = await admin.from("subscriptions").insert({
      email: alice.email,
      user_id: alice.id,
      stripe_customer_id: "cus_rlstest",
      stripe_subscription_id: `sub_rlstest_${alice.id.slice(0, 8)}`,
      status: "active",
      livemode: false,
      amount_pence: 500,
      currency: "gbp",
      started_at: new Date().toISOString(),
    });
    if (error) throw error;
  });

  it("are visible to their owner only", async () => {
    const own = await alice.client.from("subscriptions").select("status");
    expect(own.data).toEqual([{ status: "active" }]);
    const other = await bob.client.from("subscriptions").select("*");
    expect(other.data).toEqual([]);
  });

  it("cannot be written by users", async () => {
    const { error } = await bob.client.from("subscriptions").insert({
      email: bob.email,
      stripe_customer_id: "cus_fake",
      stripe_subscription_id: "sub_rlstest_fake",
      status: "active",
      livemode: true,
      started_at: new Date().toISOString(),
    });
    expect(error?.code).toBe("42501");
  });
});

describe("server-side rules", () => {
  it("rate limit allows up to the maximum in a window, then refuses", async () => {
    const key = `rlstest:${crypto.randomUUID()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const { data, error } = await admin.rpc("hit_rate_limit", { p_key: key, p_window_seconds: 3600, p_max: 2 });
      expect(error).toBeNull();
      results.push(data as boolean);
    }
    expect(results).toEqual([true, true, false]);
    await admin.from("rate_limits").delete().eq("key", key);
  });

  it("rate limit rows older than a day and waitlist addresses older than 30 days are cleared (T11)", async () => {
    const old = `rlstest-old:${crypto.randomUUID()}`;
    const email = `rlstest-${crypto.randomUUID().slice(0, 8)}@polisher.test`;
    expect((await admin.from("rate_limits").insert({ key: old, window_start: new Date(Date.now() - 2 * 86_400_000).toISOString(), count: 1 })).error).toBeNull();
    expect((await admin.from("waitlist").insert({ email, ip_hash: "x".repeat(64), created_at: new Date(Date.now() - 31 * 86_400_000).toISOString() })).error).toBeNull();
    const fresh = `rlstest:${crypto.randomUUID()}`;
    expect((await admin.rpc("hit_rate_limit", { p_key: fresh, p_window_seconds: 3600, p_max: 1 })).data).toBe(true);
    expect((await admin.from("rate_limits").select("key").eq("key", old)).data).toEqual([]);
    expect((await admin.from("rate_limits").select("key").eq("key", fresh)).data).toHaveLength(1);
    expect((await admin.from("waitlist").select("ip_hash").eq("email", email).single()).data).toEqual({ ip_hash: null });
    await admin.from("rate_limits").delete().eq("key", fresh);
    await admin.from("waitlist").delete().eq("email", email);
  });

  it("usage ledger sums real costs by user, tier and period, exact to the nano-dollar", async () => {
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { error } = await admin.from("usage_events").insert([
      { user_id: alice.id, kind: "rewrite", tier: "paid", outcome: "mock", cost_usd: 0.000000123 },
      { user_id: alice.id, kind: "style_profile", tier: "paid", outcome: "mock", cost_usd: 0.002, cache_read_tokens: 10, cache_write_tokens: 5 },
      { user_id: alice.id, kind: "rewrite", tier: "paid", outcome: "mock", cost_usd: 0.5, created_at: dayAgo },
      { user_id: alice.id, kind: "rewrite", tier: "free", outcome: "mock", cost_usd: 0.003 },
      { user_id: bob.id, kind: "rewrite", tier: "paid", outcome: "mock", cost_usd: 0.25 },
    ], { defaultToNull: false });
    expect(error).toBeNull();
    const spent = async (tier: string, since: string) =>
      Number((await admin.rpc("usage_spent", { p_user_id: alice.id, p_tier: tier, p_since: since })).data);
    expect(await spent("paid", hourAgo)).toBe(0.002000123);
    expect(await spent("paid", new Date(Date.now() - 2 * 86_400_000).toISOString())).toBe(0.502000123);
    expect(await spent("free", hourAgo)).toBe(0.003);
    const all = await admin.rpc("ai_spend_since", { p_since: hourAgo });
    expect(Number(all.data)).toBeGreaterThanOrEqual(0.255000123);
    const free = Number((await admin.rpc("tier_spend_since", { p_tier: "free", p_since: hourAgo })).data);
    const paid = Number((await admin.rpc("tier_spend_since", { p_tier: "paid", p_since: hourAgo })).data);
    expect(free).toBeGreaterThanOrEqual(0.003);
    expect(paid).toBeGreaterThanOrEqual(0.252000123);
    expect(free + paid).toBeCloseTo(Number(all.data), 9);
    await admin.from("usage_events").delete().in("user_id", [alice.id, bob.id]);
  });

  it("sums the words a user's paid rewrites were charged since a moment (credits by the word, 16 Oct)", async () => {
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { error } = await admin.from("usage_events").insert([
      { user_id: alice.id, kind: "rewrite", tier: "paid", outcome: "mock", cost_usd: 0.0001, charged_words: 50 },
      { user_id: alice.id, kind: "rewrite", tier: "paid", outcome: "mock", cost_usd: 0.0002, charged_words: 123 },
      { user_id: alice.id, kind: "style_profile", tier: "paid", outcome: "mock", cost_usd: 0.0001, charged_words: 0 },
      { user_id: alice.id, kind: "rewrite", tier: "paid", outcome: "mock", cost_usd: 0.0001, charged_words: 1000, created_at: dayAgo },
      { user_id: alice.id, kind: "rewrite", tier: "free", outcome: "mock", cost_usd: 0.0001, charged_words: 0 },
      { user_id: bob.id, kind: "rewrite", tier: "paid", outcome: "mock", cost_usd: 0.0001, charged_words: 200 },
    ], { defaultToNull: false });
    expect(error).toBeNull();
    const used = async (since: string) => (await admin.rpc("words_charged", { p_user_id: alice.id, p_since: since })).data;
    expect(await used(hourAgo)).toBe(173);
    expect(await used(new Date(Date.now() - 2 * 86_400_000).toISOString())).toBe(1173);
    expect(await used(new Date(Date.now() + 60_000).toISOString())).toBe(0);
    // Rows without words default to 0, and the database refuses a negative or impossible count.
    const plain = await admin.from("usage_events").insert({ user_id: alice.id, kind: "rewrite", tier: "paid", outcome: "error", cost_usd: 0 }).select("charged_words").single();
    expect(plain.data).toEqual({ charged_words: 0 });
    expect((await admin.from("usage_events").insert({ user_id: alice.id, kind: "rewrite", tier: "paid", outcome: "ok", cost_usd: 0, charged_words: -1 })).error).not.toBeNull();
    expect((await admin.from("usage_events").insert({ user_id: alice.id, kind: "rewrite", tier: "paid", outcome: "ok", cost_usd: 0, charged_words: 10_001 })).error).not.toBeNull();
    // The whole-credit column from earlier the same day is gone.
    expect((await admin.from("usage_events").select("credits").limit(1)).error).not.toBeNull();
    await admin.from("usage_events").delete().in("user_id", [alice.id, bob.id]);
  });

  it("charges only successful calls to the user, while the global total counts every call", async () => {
    const since = new Date(Date.now() - 60_000).toISOString();
    await admin.from("usage_events").insert([
      { user_id: alice.id, kind: "rewrite", tier: "paid", outcome: "ok", cost_usd: 0.001 },
      { user_id: alice.id, kind: "rewrite", tier: "paid", outcome: "mock", cost_usd: 0.0002 },
      { user_id: alice.id, kind: "rewrite", tier: "paid", outcome: "error", cost_usd: 0.004 },
      { user_id: alice.id, kind: "rewrite", tier: "paid", outcome: "limited", cost_usd: 0.008 },
    ]);
    expect(Number((await admin.rpc("usage_spent", { p_user_id: alice.id, p_tier: "paid", p_since: since })).data)).toBe(0.0012);
    expect(Number((await admin.rpc("ai_spend_since", { p_since: since })).data)).toBeGreaterThanOrEqual(0.0132);
    await admin.from("usage_events").delete().in("user_id", [alice.id]);
  });

  it("free rewrites are claimed one at a time up to the maximum, even when asked for at once", async () => {
    const claims = await Promise.all(Array.from({ length: 5 }, () => admin.rpc("claim_free_rewrite", { p_user_id: bob.id, p_max: 2 })));
    expect(claims.map((c) => c.error)).toEqual([null, null, null, null, null]);
    expect(claims.map((c) => c.data).sort()).toEqual([1, 2, null, null, null]);
    expect((await admin.rpc("release_free_rewrite", { p_user_id: bob.id })).error).toBeNull();
    expect((await admin.from("profiles").select("free_rewrites_used").eq("id", bob.id).single()).data).toEqual({ free_rewrites_used: 1 });
    await admin.rpc("release_free_rewrite", { p_user_id: bob.id });
    await admin.rpc("release_free_rewrite", { p_user_id: bob.id });
    expect((await admin.from("profiles").select("free_rewrites_used").eq("id", bob.id).single()).data).toEqual({ free_rewrites_used: 0 });
  });

  it("refuses a billing period that ends before it starts", async () => {
    const { error } = await admin.from("subscriptions").insert({
      email: "period@polisher.test",
      stripe_customer_id: "cus_rlstest",
      stripe_subscription_id: `sub_rlstest_${crypto.randomUUID()}`,
      status: "active",
      livemode: false,
      started_at: new Date().toISOString(),
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() - 1000).toISOString(),
    });
    expect(error?.code).toBe("23514");
  });

  it("waitlist only accepts lower-case emails", async () => {
    const { error } = await admin.from("waitlist").insert({ email: "Mixed@Example.com" });
    expect(error?.code).toBe("23514");
  });

  it("only one kill-test run can exist, and it lasts exactly 240 hours", async () => {
    const existing = await admin.from("kill_test_runs").select("id");
    expect(existing.data).toEqual([]);
    const first = await admin.from("kill_test_runs").insert({ started_by: "rlstest" }).select().single();
    expect(first.error).toBeNull();
    const hours = (Date.parse(first.data.ends_at) - Date.parse(first.data.started_at)) / 3_600_000;
    expect(hours).toBe(240);
    const second = await admin.from("kill_test_runs").insert({ started_by: "rlstest" });
    expect(second.error?.code).toBe("23505");
    await admin.from("kill_test_runs").delete().eq("id", first.data.id);
  });

  it("deleting an account removes its samples and profile but keeps the payment record unlinked", async () => {
    const carol = await createTestUser();
    await carol.client.from("writing_samples").insert({ body: "Carol writes." });
    const subId = `sub_rlstest_${carol.id.slice(0, 8)}`;
    await admin.from("subscriptions").insert({
      email: carol.email,
      user_id: carol.id,
      stripe_customer_id: "cus_rlstest",
      stripe_subscription_id: subId,
      status: "active",
      livemode: false,
      started_at: new Date().toISOString(),
    });

    await deleteTestUser(carol);

    const samples = await admin.from("writing_samples").select("id").eq("user_id", carol.id);
    expect(samples.data).toEqual([]);
    const profile = await admin.from("profiles").select("id").eq("id", carol.id);
    expect(profile.data).toEqual([]);
    const sub = await admin.from("subscriptions").select("user_id").eq("stripe_subscription_id", subId).single();
    expect(sub.data).toEqual({ user_id: null });
  });
});
