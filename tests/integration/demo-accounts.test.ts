// Demo accounts (29 Oct 2026) against polisher-test: made through the admin API with no email sent,
// signed in with their random password, and deleted by the hourly clean-up once old enough.
import { afterAll, describe, expect, it } from "vitest";
import { createDemoAccount, isDemoEmail } from "@/lib/server/demo-account";
import { admin, anon, createTestUser, type TestUser } from "./supabase-test-project";

const made: string[] = [];
let other: TestUser | undefined;

afterAll(async () => {
  for (const id of made) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  if (other) await admin.auth.admin.deleteUser(other.id).catch(() => undefined);
});

describe("demo accounts", () => {
  it("makes a confirmed demo account that signs in with its password", async () => {
    const credentials = await createDemoAccount(admin.auth.admin);
    expect(credentials).not.toBeNull();
    expect(isDemoEmail(credentials!.email)).toBe(true);
    const { data, error } = await anon().auth.signInWithPassword(credentials!);
    expect(error).toBeNull();
    expect(data.user?.app_metadata.demo).toBe(true);
    expect(data.user?.email_confirmed_at).toBeTruthy();
    made.push(data.user!.id);
  });

  it("deletes demo accounts past their age and keeps every other account", async () => {
    const credentials = await createDemoAccount(admin.auth.admin);
    const { data } = await anon().auth.signInWithPassword(credentials!);
    const demoId = data.user!.id;
    made.push(demoId);
    other = await createTestUser();

    const { data: kept, error: keptError } = await admin.rpc("delete_expired_demo_accounts");
    expect(keptError).toBeNull();
    expect(kept).toBe(0);

    const { data: removed, error } = await admin.rpc("delete_expired_demo_accounts", { max_age: "0 seconds" });
    expect(error).toBeNull();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect((await admin.auth.admin.getUserById(demoId)).data.user).toBeNull();
    expect((await admin.auth.admin.getUserById(other.id)).data.user?.id).toBe(other.id);
  });

  it("cannot be run by visitors", async () => {
    const { error } = await anon().rpc("delete_expired_demo_accounts", { max_age: "0 seconds" });
    expect(error).not.toBeNull();
  });

});
