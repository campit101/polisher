import { randomUUID } from "node:crypto";
import { admin } from "../integration/supabase-test-project";
import { E2E_ADMIN_EMAIL } from "./admin-email";
import { signIn } from "./sign-in";
import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";

const userIds: string[] = [];
const tag = `kt-${randomUUID().slice(0, 8)}`;
// Not a reserved or throwaway domain, so these rows count like real sign-ups. polisher-test only.
const counted = (n: number) => `${tag}-${n}@polisher-e2e.com`;
async function must(query: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await query;
  if (error) throw new Error(error.message);
}
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

async function cleanUp() {
  await admin.from("kill_test_runs").delete().gte("id", 0);
  await admin.from("subscriptions").delete().like("stripe_subscription_id", `sub_${tag}_%`);
  await admin.from("events").delete().eq("utm_source", tag);
}

/** A confirmed account counted like a real sign-up (R1: sign-ups are confirmed accounts only). */
async function confirmedAccount(n: number, utmMedium: string | null) {
  const created = await admin.auth.admin.createUser({ email: counted(n), email_confirm: true });
  if (created.error) throw created.error;
  userIds.push(created.data.user.id);
  if (utmMedium) await must(admin.from("profiles").update({ utm_medium: utmMedium }).eq("id", created.data.user.id));
}

async function removeAdminUser() {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const user of data.users.filter((u) => u.email === E2E_ADMIN_EMAIL)) await admin.auth.admin.deleteUser(user.id);
}

async function signInAsAdmin(page: import("@playwright/test").Page) {
  await removeAdminUser();
  await signIn(page, userIds, E2E_ADMIN_EMAIL);
  await page.goto("/admin");
}

test.beforeEach(cleanUp);
test.afterEach(cleanUp);
test.afterAll(async () => {
  for (const id of userIds.splice(0)) await admin.auth.admin.deleteUser(id);
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/sign-in\?next=(%2F|\/)admin$/);
});

test("anyone not on the allowlist gets a plain not-found page", async ({ page }) => {
  await signIn(page, userIds);
  // Asked with the signed-in session but outside the page, because the browser logs any 404 load as a console error.
  const response = await page.request.get("/admin", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain("Kill test results");
  // The tab title is the same as any missing page's, so nothing gives the page away (T11).
  const title = async (path: string) => /<title>([^<]*)<\/title>/.exec(await (await page.request.get(path, { maxRedirects: 0 })).text())?.[1];
  const plain = await title("/no-such-page");
  expect(plain).toBeTruthy();
  expect(await title("/admin")).toBe(plain);
  expect(await title("/admin/blind")).toBe(plain);
});

test("before the test: numbers so far, and the start button stays off while the site is hidden", async ({ page }) => {
  await signInAsAdmin(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kill test results");
  await expect(page.getByTestId("test-status")).toContainText("Not started");
  await expect(page.getByRole("heading", { name: "If the test ended now" })).toBeVisible();
  await expect(page.getByTestId("ai-mode")).toHaveText("AI mode: pretend AI (test only)");
  await expect(page.getByTestId("ai-spend")).toContainText("of $0.13");
  await expect(page.getByTestId("not-launched")).toContainText("LAUNCHED is not true");
  await expect(page.getByTestId("start-test")).toBeDisabled();
  await expectNoSeriousA11yIssues(page);
});

test("failed AI calls today are counted, with a pointer to the Anthropic balance (pre-launch review, 17 Oct)", async ({ page }) => {
  // A failed call leaves an error row with no cost, which is what an empty Anthropic balance produces.
  const inserted = await admin
    .from("usage_events")
    .insert({ user_id: null, kind: "rewrite", tier: "free", input_tokens: 0, output_tokens: 0, cost_usd: 0, outcome: "error" })
    .select("id")
    .single();
  expect(inserted.error).toBeNull();
  try {
    await signInAsAdmin(page);
    const failed = page.getByTestId("ai-failures");
    await expect(failed).toContainText("Failed AI calls today:");
    const count = Number((await failed.textContent())?.match(/today: (\d+)/)?.[1]);
    expect(count).toBeGreaterThanOrEqual(1);
    await expect(failed).toContainText("If rewrites keep failing, check the Anthropic balance first.");
    await expectNoSeriousA11yIssues(page);
  } finally {
    await admin.from("usage_events").delete().eq("id", inserted.data!.id);
  }
});

test("during the test: counts only real, confirmed, free-channel sign-ups and live unrefunded payments", async ({ page }) => {
  await must(admin.from("kill_test_runs").insert({ started_at: hoursAgo(1), started_by: E2E_ADMIN_EMAIL }));
  for (const [n, medium] of [[1, null], [2, "social"], [3, null], [4, "cpc"]] as const) await confirmedAccount(n, medium);
  const sub = (n: number, over: Record<string, unknown> = {}) => ({
    email: counted(n),
    stripe_customer_id: `cus_${tag}_${n}`,
    stripe_subscription_id: `sub_${tag}_${n}`,
    status: "active",
    livemode: true,
    started_at: hoursAgo(0.5),
    refunded_at: null,
    ...over,
  });
  await must(admin.from("subscriptions").insert([sub(1), sub(2), sub(3, { refunded_at: hoursAgo(0.2) }), sub(4, { livemode: false })]));

  await signInAsAdmin(page);
  await expect(page.getByTestId("test-status")).toContainText(/Running\. Ends .+ 238 hours left\./);
  await expect(page.getByTestId("signups")).toHaveText("3 of 100");
  await expect(page.getByTestId("signups-left-out")).toContainText("1 from paid ads");
  await expect(page.getByTestId("paid")).toHaveText("2 of 5");
  await expect(page.getByTestId("paid-left-out")).toContainText("1 test payment");
  await expect(page.getByTestId("paid-left-out")).toContainText("1 refund");
  await expect(page.getByTestId("verdict")).toHaveText("Fail");
  await expect(page.getByTestId("funnel-signups")).toHaveText("3");
  await expect(page.getByTestId("funnel-paid")).toHaveText("2");
  await expect(page.getByTestId("start-form")).toHaveCount(0);
  await expectNoSeriousA11yIssues(page);
});

test("during the test: visits, sign-ups and paid per tracking source", async ({ page }) => {
  await must(admin.from("kill_test_runs").insert({ started_at: hoursAgo(1), started_by: E2E_ADMIN_EMAIL }));
  await confirmedAccount(5, null);
  await must(admin.from("profiles").update({ utm_source: tag }).eq("id", userIds[userIds.length - 1]));
  // Two page views by one person (same daily code) and one by another: 3 visits, 2 people.
  const code = (c: string) => c.repeat(64);
  await must(
    admin.from("events").insert([
      { name: "landing_view", path: "/", utm_source: tag, visitor_day: code("a") },
      { name: "landing_view", path: "/", utm_source: tag, visitor_day: code("a") },
      { name: "landing_view", path: "/", utm_source: tag, visitor_day: code("b") },
    ]),
  );
  // No source on the payment itself: it takes the source of the account with the same inbox.
  await must(
    admin.from("subscriptions").insert({
      email: counted(5),
      stripe_customer_id: `cus_${tag}_5`,
      stripe_subscription_id: `sub_${tag}_5`,
      status: "active",
      livemode: true,
      started_at: hoursAgo(0.5),
    }),
  );

  await signInAsAdmin(page);
  await expect(page.getByRole("heading", { name: "Where people came from" })).toBeVisible();
  const row = page.getByTestId("sources").getByRole("row", { name: tag });
  await expect(row.getByRole("cell")).toHaveText(["3", "2", "1", "1"]);
  // The channels with tracked bio links are always listed, even before anyone arrives from them.
  for (const channel of ["tiktok", "instagram", "youtube"]) await expect(page.getByTestId("sources").getByRole("row", { name: channel })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Different people" })).toBeVisible();
  await expect(page.getByTestId("people")).toContainText(/\d+ so far, \d+ today/);
  await expectNoSeriousA11yIssues(page);
});

test("after the test: the result is saved once and later changes do not alter it", async ({ page }) => {
  await must(admin.from("kill_test_runs").insert({ started_at: hoursAgo(300), started_by: E2E_ADMIN_EMAIL }));
  // A live payment dated inside the old window counts once; deleting it later must not change the result.
  await must(
    admin.from("subscriptions").insert({ email: counted(1), stripe_customer_id: `cus_${tag}_1`, stripe_subscription_id: `sub_${tag}_1`, status: "active", livemode: true, started_at: hoursAgo(299), refunded_at: null }),
  );

  await signInAsAdmin(page);
  await expect(page.getByTestId("test-status")).toContainText("Finished");
  await expect(page.getByRole("heading", { name: "Result", exact: true })).toBeVisible();
  await expect(page.getByTestId("paid")).toHaveText("1 of 5");
  const { data: run } = await admin.from("kill_test_runs").select("frozen_result, frozen_at").single();
  expect(run?.frozen_at).not.toBeNull();
  expect(run?.frozen_result).toMatchObject({ verdict: "fail", paid: { counted: 1 } });

  await admin.from("subscriptions").delete().eq("stripe_subscription_id", `sub_${tag}_1`);
  await page.reload();
  await expect(page.getByTestId("paid")).toHaveText("1 of 5");
});
