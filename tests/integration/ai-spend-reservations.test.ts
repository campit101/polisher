// The hard daily AI ceiling's reservations (audit, 29 Oct 2026) against polisher-test.
import { afterAll, describe, expect, it } from "vitest";
import { admin, anon } from "./supabase-test-project";

// A moment in the future, so the day's real spend counts as zero and the test is independent of it.
const since = new Date(Date.now() + 3_600_000).toISOString();
const made: number[] = [];

afterAll(async () => {
  for (const id of made) await admin.rpc("release_ai_spend", { p_id: id });
});

describe("AI spend reservations", () => {
  it("grants reservations only while recorded spend plus open reservations stays within the cap", async () => {
    // Other tests may hold open reservations, so the cap is set relative to what is already held.
    const { data: rows } = await admin.from("ai_spend_reservations").select("amount_usd");
    const held = (rows ?? []).reduce((sum, r) => sum + Number(r.amount_usd), 0);
    const cap = (held + 0.01).toFixed(9);
    const first = await admin.rpc("reserve_ai_spend", { p_since: since, p_cap_usd: cap, p_amount_usd: "0.006000000" });
    expect(first.error).toBeNull();
    expect(typeof first.data).toBe("number");
    made.push(first.data as number);
    const second = await admin.rpc("reserve_ai_spend", { p_since: since, p_cap_usd: cap, p_amount_usd: "0.006000000" });
    expect(second.error).toBeNull();
    expect(second.data).toBeNull();
    await admin.rpc("release_ai_spend", { p_id: first.data });
    const third = await admin.rpc("reserve_ai_spend", { p_since: since, p_cap_usd: cap, p_amount_usd: "0.006000000" });
    expect(typeof third.data).toBe("number");
    made.push(third.data as number);
  });

  it("cannot be used or read by visitors", async () => {
    expect((await anon().rpc("reserve_ai_spend", { p_since: since, p_cap_usd: "1", p_amount_usd: "0.1" })).error).not.toBeNull();
    const read = await anon().from("ai_spend_reservations").select("id");
    expect(read.error !== null || (read.data ?? []).length === 0).toBe(true);
  });
});
