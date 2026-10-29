// Rate limits trigger and the visitor sees a plain message (CONSTRAINTS.md gate 2, T10). Each test
// fills one limit's counter to its maximum in polisher-test, then does one more thing in the browser.
// No email is sent and no AI is called: the limits are checked before either.
import { admin } from "../integration/supabase-test-project";
import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";
import { signIn } from "./sign-in";

const userIds: string[] = [];
const FUNCTION_WAIT = { timeout: 30_000 };

test.beforeEach(async () => {
  await admin.from("rate_limits").delete().or("key.like.taste-ip:%,key.like.pow:%,key.like.pow-issue:%,key.eq.taste-global,key.like.demo-ip:%,key.eq.demo-all,key.like.rewrite-ip:%");
});

test.afterAll(async () => {
  await admin.from("rate_limits").delete().or("key.like.taste-ip:%,key.like.pow:%,key.like.pow-issue:%,key.eq.taste-global,key.like.demo-ip:%,key.eq.demo-all,key.like.rewrite-ip:%");
  await admin.from("usage_events").delete().is("user_id", null).eq("tier", "free");
  await admin.from("usage_events").delete().in("user_id", userIds);
  for (const id of userIds.splice(0)) await admin.auth.admin.deleteUser(id);
});

/** The current one-hour window (as hit_rate_limit computes it) and the next, in case the hour turns mid-test. */
const windows = () => {
  const start = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  return [start, start + 3_600_000].map((ms) => new Date(ms).toISOString());
};

/** Sets a counter to its maximum, so the next hit is refused. */
async function fillLimit(key: string, max: number) {
  const { error } = await admin.from("rate_limits").upsert(windows().map((window_start) => ({ key, window_start, count: max })));
  if (error) throw error;
}

/** The one counter whose key starts with prefix (made by the visitor's first action). */
async function keyStartingWith(prefix: string) {
  const { data, error } = await admin.from("rate_limits").select("key").like("key", `${prefix}%`);
  if (error) throw error;
  expect(new Set(data.map((row) => row.key)).size).toBe(1);
  return data[0]!.key;
}

/** Answers 3 questions and pastes a short draft, ready for the free try. */
async function readyTaste(page: import("@playwright/test").Page) {
  await page.getByTestId("taste").getByRole("button", { name: /Your writing/ }).click();
  const writing = page.getByRole("dialog", { name: "Your writing" });
  for (let i = 0; i < 3; i++) await writing.locator(`#taste-answer-${i}`).fill(`Answer ${i}. ` + Array(60).fill("word").join(" "));
  await writing.getByRole("button", { name: "Done" }).click();
  await page.getByLabel("Paste an AI draft").fill("Hi Jo, the room is booked for 3pm on Friday.");
}

const tastesSince = async (since: string) =>
  (await admin.from("events").select("id", { count: "exact", head: true }).eq("name", "taste_completed").gte("created_at", since)).count;

test("the free try works once per browser: then Rewrite asks the visitor to start a demo account, and the server refuses another (Cam, 16 Oct)", async ({ page, context }) => {
  const since = new Date().toISOString();
  await page.goto("/");
  await readyTaste(page);
  await page.getByTestId("taste-rewrite").click();
  await expect(page.getByTestId("taste-result")).toBeVisible(FUNCTION_WAIT);
  const after = page.getByRole("dialog", { name: "Like it? Start a demo account to keep going" });
  await expect(after).toBeVisible();
  await after.getByRole("button", { name: "Not now" }).click();
  await expect(after).toBeHidden();

  // The button now says what it does: start a demo account for another rewrite, and it sends nothing.
  await expect(page.getByTestId("taste-rewrite")).toHaveText("Start a demo account for another rewrite");
  await page.getByTestId("taste-rewrite").click();
  const used = page.getByRole("dialog", { name: "You've had your free try. Start a demo account for another rewrite" });
  await expect(used).toBeVisible();
  await expect(used.getByTestId("start-demo")).toBeVisible();
  await used.getByRole("button", { name: "Not now" }).click();
  expect(await tastesSince(since)).toBe(1);

  // Even if the page forgets (its storage cleared), the server's cookie still says no.
  expect((await context.cookies()).some((c) => c.name === "polisher_taste" && c.httpOnly)).toBe(true);
  await page.evaluate(() => localStorage.removeItem("polisher-taste-done"));
  await page.reload();
  await page.getByLabel("Paste an AI draft").fill("Hi Jo, the room is booked for 3pm on Friday.");
  await page.getByTestId("taste-rewrite").click();
  const again = page.getByRole("dialog", { name: "You've had your free try. Start a demo account for another rewrite" });
  await expect(again).toBeVisible(FUNCTION_WAIT);
  expect(await tastesSince(since)).toBe(1);
  await again.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByTestId("taste-used")).toHaveText("You've had your free try. Start a demo account for another rewrite.");
  // The "first rewrite is free" line is no longer true for this browser, so it goes.
  await expect(page.getByTestId("taste-free")).toHaveCount(0);
  await expect(page.getByTestId("taste-rewrite")).toHaveText("Start a demo account for another rewrite");
  await expectNoSeriousA11yIssues(page);
});

test("a connection that has used its free tries is refused even from a new browser", async ({ page }) => {
  await page.goto("/");
  await readyTaste(page);
  // The first try makes the connection's daily counter; fill it before pressing.
  const day = Math.floor(Date.now() / 86_400_000) * 86_400_000;
  await page.getByTestId("taste-rewrite").click();
  await expect(page.getByTestId("taste-result")).toBeVisible(FUNCTION_WAIT);
  const key = await keyStartingWith("taste-ip:");
  const { error } = await admin.from("rate_limits").upsert([day, day + 86_400_000].map((ms) => ({ key, window_start: new Date(ms).toISOString(), count: 2 })));
  if (error) throw error;
  // A new browser on the same connection: no cookie, no memory, but the connection is used up.
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.removeItem("polisher-taste-done"));
  await page.reload();
  await page.getByLabel("Paste an AI draft").fill("Hi Jo, the room is booked for 3pm on Friday.");
  await page.getByTestId("taste-rewrite").click();
  await expect(page.getByRole("dialog", { name: "You've had your free try. Start a demo account for another rewrite" })).toBeVisible(FUNCTION_WAIT);
});

test("Start a demo account stops when the shared hourly limit for all demo accounts is used", async ({ page }) => {
  await fillLimit("demo-all", 120);
  await page.goto("/sign-in");
  await page.getByTestId("start-demo").click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Too many demo accounts from here this hour. Wait a while and try again.", { timeout: 20_000 });
  await expect(page).toHaveURL(/\/sign-in/);
  await expectNoSeriousA11yIssues(page);
});

test("the Write page stops rewrites from one connection after 60 in an hour", async ({ page }) => {
  const user = await signIn(page, userIds);
  // Every sample slot filled, so the once-a-visit samples nudge stays shut.
  await admin.from("writing_samples").insert([1, 2, 3, 4, 5].map((n) => ({ user_id: user.id, body: `Sample ${n}. ` + Array(110).fill("word").join(" ") })));
  await page.goto("/app");
  const box = page.getByRole("textbox", { name: "Paste an AI draft" });
  await box.fill("Hi Jo, the room is booked for 3pm on Friday.");
  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("result-text")).toBeVisible(FUNCTION_WAIT);

  await fillLimit(await keyStartingWith("rewrite-ip:"), 60);
  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("rewrite-error")).toHaveText("That's a lot of rewrites in an hour. Wait a while and try again.", FUNCTION_WAIT);
  // Refused before the AI: the free rewrite count did not move.
  const { data } = await admin.from("profiles").select("free_rewrites_used").eq("id", user.id).single();
  expect(data).toEqual({ free_rewrites_used: 1 });
  await expectNoSeriousA11yIssues(page);
});

test("when the shared daily AI ceiling is reached, the Write page shows busy and the ready-made examples (d)", async ({ page }) => {
  const user = await signIn(page, userIds);
  await admin.from("writing_samples").insert([1, 2, 3, 4, 5].map((n) => ({ user_id: user.id, body: `Sample ${n}. ` + Array(110).fill("word").join(" ") })));
  // One row at the ceiling ($0.13, src/config/usage.ts) for today, from nobody in particular.
  const inserted = await admin
    .from("usage_events")
    .insert({ user_id: null, kind: "rewrite", tier: "free", input_tokens: 0, output_tokens: 0, cost_usd: 0.13, outcome: "ok" })
    .select("id")
    .single();
  expect(inserted.error).toBeNull();
  try {
    await page.goto("/app");
    await page.getByRole("textbox", { name: "Paste an AI draft" }).fill("Hi Jo, the room is booked for 3pm on Friday.");
    await page.getByTestId("rewrite").click();
    await expect(page.getByTestId("busy")).toContainText("Today's shared demo AI budget of £0.10 is used up", FUNCTION_WAIT);
    const examples = page.getByTestId("ready-made-examples");
    await expect(examples).toBeVisible();
    await expect(examples.getByRole("heading", { name: "Ready-made examples" })).toBeVisible();
    await expect(examples.locator("details")).toHaveCount(3);
    await examples.locator("details summary").first().click();
    await expect(examples.getByText("Polisher's rewrite").first()).toBeVisible();
    // Refused before the AI: the free rewrite count did not move.
    const { data } = await admin.from("profiles").select("free_rewrites_used").eq("id", user.id).single();
    expect(data).toEqual({ free_rewrites_used: 0 });
    await expectNoSeriousA11yIssues(page);
  } finally {
    await admin.from("usage_events").delete().eq("id", inserted.data!.id);
  }
});
