// A Google sign-up in the kill-test count (pre-launch review, 17 Oct). Email sign-ups get
// their campaign labels when the account is made; Google ones get them on the way back through
// /auth/confirm (saveSignupUtm). This checks that path writes what the count reads, so a paid-ad
// Google sign-up is left out, an ordinary one counts, and an older account is never relabelled.
import { afterEach, describe, expect, it } from "vitest";
import { countSignups, type AccountRow } from "@/lib/kill-test-count";
import { saveSignupUtm } from "@/lib/server/account";
import { admin, createTestUser, deleteTestUser, type TestUser } from "./supabase-test-project";

let user: TestUser | undefined;
afterEach(async () => {
  await deleteTestUser(user);
  user = undefined;
});

async function accountRow(id: string): Promise<AccountRow & { createdAt: string }> {
  const { data } = await admin.auth.admin.getUserById(id);
  const profile = await admin.from("profiles").select("utm_medium").eq("id", id).single();
  return {
    email: data.user!.email!,
    created_at: data.user!.created_at,
    email_confirmed_at: data.user!.email_confirmed_at ?? null,
    utm_medium: profile.data!.utm_medium,
    createdAt: data.user!.created_at,
  };
}

const windowAround = (createdAt: string) => ({ start: new Date(new Date(createdAt).getTime() - 60_000), end: new Date(new Date(createdAt).getTime() + 60_000) });
// Test addresses are left out of the real count, so the person is counted under an ordinary address.
const asPerson = (row: AccountRow): AccountRow => ({ ...row, email: "fake.someone0004@gmail.com" });

describe("Google sign-ups and the kill-test count", () => {
  it("a new Google sign-up from a paid advert gets its label and is left out", async () => {
    user = await createTestUser();
    const before = await accountRow(user.id);
    await saveSignupUtm({ id: user.id, email: user.email, created_at: before.createdAt }, { utm_source: "tiktok", utm_medium: "cpc" });
    const after = await accountRow(user.id);
    expect(after.utm_medium).toBe("cpc");
    const result = countSignups([asPerson(after)], new Set<string>(), windowAround(after.createdAt));
    expect(result.counted).toBe(0);
  });

  it("a new Google sign-up with no advert label counts", async () => {
    user = await createTestUser();
    const row = await accountRow(user.id);
    await saveSignupUtm({ id: user.id, email: user.email, created_at: row.createdAt }, {});
    expect(countSignups([asPerson(await accountRow(user.id))], new Set<string>(), windowAround(row.createdAt)).counted).toBe(1);
  });

  it("an account made more than ten minutes ago is never relabelled", async () => {
    user = await createTestUser();
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await saveSignupUtm({ id: user.id, email: user.email, created_at: old }, { utm_medium: "cpc" });
    expect((await accountRow(user.id)).utm_medium).toBeNull();
  });
});
