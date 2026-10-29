import { randomUUID } from "node:crypto";
import { admin } from "../integration/supabase-test-project";
import { E2E_ADMIN_EMAIL } from "./admin-email";
import { signIn } from "./sign-in";
import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";

// Each run uses its own set, so the real "kill-test" pairs in polisher-test are never touched.
const set = `e2e-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];

async function cleanUp() {
  await admin.from("blind_pairs").delete().eq("set_name", set);
}

async function signInAsAdmin(page: import("@playwright/test").Page) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const user of data.users.filter((u) => u.email === E2E_ADMIN_EMAIL)) await admin.auth.admin.deleteUser(user.id);
  await signIn(page, userIds, E2E_ADMIN_EMAIL);
}

/** 20 pairs with Polisher always as version A, so the expected tally is easy to read. */
async function makePairs() {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    set_name: set,
    draft_id: `draft-${i + 1}`,
    text_a: `Polisher text ${i + 1}`,
    source_a: "polisher",
    text_b: `Plain text ${i + 1}`,
    source_b: "baseline",
  }));
  const { error } = await admin.from("blind_pairs").insert(rows);
  if (error) throw new Error(error.message);
}

test.beforeEach(cleanUp);
test.afterEach(cleanUp);
test.afterAll(async () => {
  for (const id of userIds.splice(0)) await admin.auth.admin.deleteUser(id);
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/admin/blind");
  await expect(page).toHaveURL(/\/sign-in\?next=(%2F|\/)admin(%2F|\/)blind$/);
});

test("anyone not on the allowlist gets a plain not-found page", async ({ page }) => {
  await signIn(page, userIds);
  const response = await page.request.get("/admin/blind", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
  // The tab title travels in the 404 metadata (as on /admin), so check the page body is absent.
  expect(await response.text()).not.toContain("Which would you rather send");
});

test("with no pairs it says so, and /admin links to it", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/admin");
  await page.getByTestId("blind-link").click();
  await expect(page).toHaveURL(/\/admin\/blind$/);
  await page.goto(`/admin/blind?set=${set}`);
  await expect(page.getByTestId("blind-empty")).toContainText("No pairs yet");
});

test("judging: one pair at a time, sources hidden, then the locked verdict", async ({ page }) => {
  await makePairs();
  await signInAsAdmin(page);
  await page.goto(`/admin/blind?set=${set}`);

  await expect(page.getByTestId("pair-number")).toHaveText("Pair 1 of 20");
  await expect(page.getByTestId("blind-progress")).toHaveText("0 of 20 judged");
  await expect(page.getByTestId("text-a")).toHaveText("Polisher text 1");
  await expect(page.getByTestId("text-b")).toHaveText("Plain text 1");
  // Which side is which is never on the page while judging.
  await expect(page.locator("main")).not.toContainText("Plain AI rewrite");
  await expectNoSeriousA11yIssues(page);

  await page.getByTestId("choose-a").click();
  await expect(page.getByTestId("pair-number")).toHaveText("Pair 2 of 20");
  await expect(page.getByTestId("blind-progress")).toHaveText("1 of 20 judged");
  await expect(page.getByTestId("text-a")).toHaveText("Polisher text 2");
  await page.getByTestId("choose-b").click();
  await expect(page.getByTestId("pair-number")).toHaveText("Pair 3 of 20");

  const { data: judged } = await admin.from("blind_pairs").select("draft_id, winner, judged_at").eq("set_name", set).not("winner", "is", null).order("id");
  expect(judged?.map((r) => [r.draft_id, r.winner])).toEqual([
    ["draft-1", "a"],
    ["draft-2", "b"],
  ]);
  expect(judged?.every((r) => r.judged_at)).toBe(true);

  // The other 18 straight in the database: 12 more for Polisher makes 13 of 20, which needs a written reason.
  const { data: rest } = await admin.from("blind_pairs").select("id").eq("set_name", set).is("winner", null).order("id");
  for (const [i, row] of (rest ?? []).entries()) {
    const { error } = await admin.from("blind_pairs").update({ winner: i < 12 ? "a" : "b", judged_at: new Date().toISOString() }).eq("id", row.id);
    if (error) throw new Error(error.message);
  }
  await page.reload();
  await expect(page.getByTestId("blind-verdict")).toHaveText("Write down why");
  await expect(page.getByTestId("blind-wins")).toHaveText("Polisher won 13 of 20");
  await expect(page.getByTestId("blind-choices").locator("tbody tr")).toHaveCount(20);
  await expect(page.getByTestId("blind-choices").locator("tbody tr").nth(1)).toContainText("Plain AI rewrite");
  await expect(page.getByTestId("judge-form")).toHaveCount(0);
  await expectNoSeriousA11yIssues(page);
});

test("blind comparison 2: Haiku against Sonnet, names hidden, then the switch rule", async ({ page }) => {
  // Launch decision 1 (Cam, 16 Oct): its own set, Haiku in the "polisher" slot, Sonnet in "baseline".
  const modelSet = `model-compare-e2e-${randomUUID().slice(0, 8)}`;
  try {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      set_name: modelSet,
      draft_id: `draft-${i + 1}`,
      text_a: `Today text ${i + 1}`,
      source_a: "polisher",
      text_b: `Other text ${i + 1}`,
      source_b: "baseline",
    }));
    const { error } = await admin.from("blind_pairs").insert(rows);
    if (error) throw new Error(error.message);
    await signInAsAdmin(page);
    await page.goto(`/admin/blind?set=${modelSet}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blind comparison 2: which model");
    await expect(page.locator("main")).not.toContainText("Sonnet");
    await expect(page.locator("main")).not.toContainText("Haiku");
    await page.getByTestId("choose-b").click();
    await expect(page.getByTestId("pair-number")).toHaveText("Pair 2 of 20");

    // 13 more for Sonnet makes 14 of 20: the switch mark.
    const { data: rest } = await admin.from("blind_pairs").select("id").eq("set_name", modelSet).is("winner", null).order("id");
    for (const [i, row] of (rest ?? []).entries()) {
      const { error: e } = await admin.from("blind_pairs").update({ winner: i < 13 ? "b" : "a", judged_at: new Date().toISOString() }).eq("id", row.id);
      if (e) throw new Error(e.message);
    }
    await page.reload();
    await expect(page.getByTestId("blind-verdict")).toHaveText("Sonnet preferred");
    await expect(page.getByTestId("blind-wins")).toHaveText("You picked Sonnet 5.5 in 14 of 20 pairs and Haiku 5.5 in 6");
    await expect(page.getByTestId("blind-choices").locator("tbody tr").first()).toContainText("Sonnet 5.5");
    await expect(page.getByTestId("blind-choices").locator("tbody tr").last()).toContainText("Haiku 5.5 (today)");
    await expectNoSeriousA11yIssues(page);
  } finally {
    await admin.from("blind_pairs").delete().eq("set_name", modelSet);
  }
});
