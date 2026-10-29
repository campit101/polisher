// The deployed "rewrite" Edge Function on polisher-test (ai_mode = mock, so no paid AI is called).
// Also proves the deployed copy of the clean-up code matches this repository: every stock phrase and
// every US spelling goes through the function and must come back exactly as the local code makes it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { polish } from "../../supabase/functions/_shared/polish/index.ts";
import { STOCK_PHRASES } from "../../supabase/functions/_shared/polish/stock-phrases.ts";
import { US_TO_UK } from "../../supabase/functions/_shared/polish/uk-spelling.ts";
import { admin, createTestUser, deleteTestUser, type TestUser, url } from "./supabase-test-project";

const sample = (n: number) => `Sample ${n}: I tend to write short notes, plain and to the point, with the odd joke. ` + Array(110).fill("word").join(" ");
const users: TestUser[] = [];

async function call(user: TestUser | null, body: unknown) {
  const token = user ? (await user.client.auth.getSession()).data.session?.access_token : "not-a-token";
  const response = await fetch(`${url}/functions/v1/rewrite`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function userWithSamples(count = 3) {
  const user = await createTestUser();
  users.push(user);
  for (let i = 1; i <= count; i++) await user.client.from("writing_samples").insert({ body: sample(i) });
  return user;
}

async function subscribe(user: TestUser) {
  const { error } = await admin.from("subscriptions").insert({
    email: user.email,
    user_id: user.id,
    stripe_customer_id: "cus_fntest",
    stripe_subscription_id: `sub_fntest_${user.id}`,
    status: "active",
    livemode: false,
    started_at: new Date().toISOString(),
    current_period_start: new Date(Date.now() - 86_400_000).toISOString(),
    current_period_end: new Date(Date.now() + 29 * 86_400_000).toISOString(),
  });
  if (error) throw error;
}

beforeAll(async () => {
  const mode = await admin.from("app_settings").select("value").eq("key", "ai_mode").single();
  if (mode.data?.value !== "mock") throw new Error("polisher-test must be in mock mode for these tests");
});

afterAll(async () => {
  await admin.from("subscriptions").delete().like("stripe_subscription_id", "sub_fntest_%");
  // Usage rows outlive deleted accounts and count towards the test project's $1 daily ceiling.
  await admin.from("usage_events").delete().in("user_id", users.map((u) => u.id));
  for (const user of users) await deleteTestUser(user);
});

describe("rewrite function", () => {
  it("refuses callers who are not signed in", async () => {
    expect(await call(null, { action: "rewrite", draft: "Hello" })).toEqual({ status: 401, body: { status: "error", reason: "signed_out" } });
  });

  it("asks for samples first", async () => {
    const user = await userWithSamples(2);
    expect((await call(user, { action: "rewrite", draft: "Hello there." })).body).toEqual({ status: "needs_samples" });
  });

  it("free tier: shows two rewrites, locks the third, then stops; the lock opens after subscribing (launch decision 3)", async () => {
    const user = await userWithSamples();
    const draft = "Hi Jo,\n\nMoreover, the color scheme costs £450. Thanks for organizing it.";

    const first = await call(user, { action: "rewrite", draft });
    expect(first.body).toMatchObject({ status: "ok", text: "Hi Jo,\n\nAlso, the colour scheme costs £451. Thanks for organising it.", usage: { tier: "free", used: 1, max: 3, shown: 2 } });
    expect(first.body.warnings.numbers).toEqual(["£450"]);
    // The not/may/will check (17 Oct) is in the deployed function: the field is there, and empty here.
    expect(first.body.warnings.certainty).toEqual([]);
    const profile = await admin.from("style_profiles").select("samples_hash").eq("user_id", user.id).single();
    expect(profile.data?.samples_hash).toMatch(/^[0-9a-f]{64}$/);

    const second = await call(user, { action: "rewrite", draft });
    expect(second.body).toMatchObject({ status: "ok", text: first.body.text, usage: { tier: "free", used: 2, max: 3 } });

    const third = await call(user, { action: "rewrite", draft });
    expect(third.body.status).toBe("locked");
    expect(third.body.preview).toMatch(/^Hi Jo,[\s•]*$/);
    for (const word of ["colour", "£451", "organising", "Thanks"]) expect(JSON.stringify(third.body)).not.toContain(word);

    expect((await call(user, { action: "rewrite", draft })).body).toMatchObject({ status: "limit", limit: "free" });

    expect((await call(user, { action: "unlock", token: third.body.token })).body).toEqual({ status: "not_subscribed" });
    await subscribe(user);
    expect((await call(user, { action: "unlock", token: third.body.token })).body).toEqual({ status: "ok", text: first.body.text });

    const rows = await admin.from("usage_events").select("kind, tier, outcome, charged_words").eq("user_id", user.id).order("id");
    expect(rows.data).toEqual([
      { kind: "style_profile", tier: "free", outcome: "mock", charged_words: 0 },
      { kind: "rewrite", tier: "free", outcome: "mock", charged_words: 0 },
      { kind: "rewrite", tier: "free", outcome: "mock", charged_words: 0 },
      { kind: "rewrite", tier: "free", outcome: "mock", charged_words: 0 },
    ]);
  });

  it("paid: each rewrite is charged its words (at least 50), and a draft with more words than are left is refused (Cam, 16 Oct)", async () => {
    const user = await userWithSamples();
    await subscribe(user);
    const short = await call(user, { action: "rewrite", draft: "Hi Jo, the colour scheme costs £450." });
    expect(short.body).toMatchObject({ status: "ok", usage: { tier: "paid", today: { used: 50, limit: 6000 }, month: { used: 50, limit: 30000 } } });
    const long = Array.from({ length: 501 }, (_, i) => `word${i}`).join(" ");
    expect((await call(user, { action: "rewrite", draft: long })).body).toMatchObject({ status: "ok", usage: { today: { used: 551 } } });
    const rows = await admin.from("usage_events").select("kind, charged_words").eq("user_id", user.id).eq("kind", "rewrite").order("id");
    expect(rows.data?.map((row) => row.charged_words)).toEqual([50, 501]);
    // 5,400 more today leaves 49 words: the 501-word draft is refused before any AI call, nothing recorded.
    await admin.from("usage_events").insert({ user_id: user.id, kind: "rewrite", tier: "paid", outcome: "mock", cost_usd: 0, charged_words: 5400 });
    expect((await call(user, { action: "rewrite", draft: long })).body).toMatchObject({ status: "limit", limit: "daily", needed: 501, usage: { today: { used: 5951, limit: 6000 } } });
    const after = await admin.from("usage_events").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    expect(after.count).toBe(4);
  });

  it("free drafts stop at 300 words before anything is spent (Cam, 16 Oct)", async () => {
    const user = await userWithSamples();
    const long = Array.from({ length: 301 }, (_, i) => `word${i}`).join(" ");
    expect((await call(user, { action: "rewrite", draft: long })).body).toEqual({ status: "error", reason: "free_too_long" });
    const rows = await admin.from("usage_events").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    expect(rows.count).toBe(0);
  });

  it("a refused answer is not charged and gives the free rewrite back", async () => {
    const user = await userWithSamples();
    expect((await call(user, { action: "rewrite", draft: "Please MOCK_REFUSE this." })).body).toEqual({ status: "error", reason: "refused" });
    expect((await admin.from("profiles").select("free_rewrites_used").eq("id", user.id).single()).data).toEqual({ free_rewrites_used: 0 });
  });

  it("the deployed clean-up matches this repository for every stock phrase and US spelling", async () => {
    const user = await userWithSamples();
    await subscribe(user);
    const lines = [
      ...STOCK_PHRASES.map((p) => `Then ${p.find} ${p.next ? "the data" : "it"} happened.`),
      ...[...US_TO_UK.keys()].map((word) => `The ${word} one.`),
    ];
    const drafts: string[] = [];
    for (let i = 0; i < lines.length; i += 150) drafts.push(lines.slice(i, i + 150).join("\n"));
    for (const draft of drafts) {
      const result = await call(user, { action: "rewrite", draft });
      expect(result.body.status, JSON.stringify(result.body).slice(0, 200)).toBe("ok");
      expect(result.body.text).toBe(polish(draft).text);
      expect(result.body.usage.tier).toBe("paid");
    }
  });
});

describe("the free taste (R1)", () => {
  const taste = { action: "taste", draft: "Hi Jo, the room is booked for 3pm on Friday.", samples: [sample(1), sample(2), sample(3)], kind: "email" };
  const started = new Date().toISOString();

  afterAll(async () => {
    await admin.from("usage_events").delete().is("user_id", null).eq("tier", "free").gte("created_at", started);
    await admin.from("rate_limits").delete().eq("key", "taste-global");
  });

  it("refuses a taste from anyone without the project's secret key, even a signed-in user", async () => {
    expect((await call(null, taste)).status).toBe(401);
    const user = await userWithSamples();
    expect((await call(user, taste)).status).toBe(401);
  });

  it("runs a taste for the website's server, with no account, in mock mode", async () => {
    const response = await fetch(`${url}/functions/v1/rewrite`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(taste),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.text).toContain("4pm on Friday");
    const rows = await admin.from("usage_events").select("user_id, tier").is("user_id", null).gte("created_at", started);
    expect(rows.data?.length).toBe(2);
  });
});
