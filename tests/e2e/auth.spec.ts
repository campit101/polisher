import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { admin } from "../integration/supabase-test-project";
import { findUserByEmail, newEmail, signIn } from "./sign-in";
import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";

const userIds: string[] = [];
const subscriptionIds: string[] = [];

test.afterAll(async () => {
  await admin.from("rate_limits").delete().or("key.like.demo-ip:%,key.eq.demo-all");
  if (subscriptionIds.length > 0) await admin.from("subscriptions").delete().in("stripe_subscription_id", subscriptionIds);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in\?next=(%2F|\/)account$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Try Polisher with a demo account");
  await expectNoSeriousA11yIssues(page);
});

test("Start a demo account lands on the Write page, and the account page shows an example.com address", async ({ page }) => {
  await admin.from("rate_limits").delete().or("key.like.demo-ip:%,key.eq.demo-all");
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Try Polisher with a demo account");
  // No email field, no Google button: one press makes the account.
  await expect(page.getByLabel("Email address")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  await page.getByTestId("start-demo").click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
  await page.goto("/account");
  const email = (await page.getByTestId("account-email").textContent()) ?? "";
  expect(email).toMatch(/^demo-[0-9a-f-]{36}@example\.com$/);
  const found = await findUserByEmail(email);
  expect(found).toBeDefined();
  userIds.push(found!.id);
  expect(found!.app_metadata.demo).toBe(true);
  await expectNoSeriousA11yIssues(page);
});

test("a press straight after the page opens (browser autofill) is held, not silently dropped (18 Oct)", async ({ page }) => {
  // Cam's real sign-in once failed because a press within 3 seconds of the page opening was dropped by the
  // bot check. The form now waits out the rest of the delay itself, so an instant press still makes the account.
  await admin.from("rate_limits").delete().or("key.like.demo-ip:%,key.eq.demo-all");
  await page.goto("/sign-in");
  await page.getByTestId("start-demo").click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
  await page.goto("/account");
  const found = await findUserByEmail((await page.getByTestId("account-email").textContent()) ?? "");
  expect(found).toBeDefined();
  userIds.push(found!.id);
});

test("a demo account can be started from the sign-in page and goes to the page it was sent from", async ({ page }) => {
  await admin.from("rate_limits").delete().or("key.like.demo-ip:%,key.eq.demo-all");
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in\?next=(%2F|\/)account$/);
  await page.getByTestId("start-demo").click();
  await expect(page).toHaveURL(/\/account$/, { timeout: 20_000 });
  const found = await findUserByEmail((await page.getByTestId("account-email").textContent()) ?? "");
  expect(found).toBeDefined();
  userIds.push(found!.id);
});

test("the sixth demo account from one connection in an hour is refused with a plain message", async ({ page }) => {
  await admin.from("rate_limits").delete().or("key.like.demo-ip:%,key.eq.demo-all");
  // Press once so the connection's counter exists, then fill it to its maximum (5 an hour).
  await page.goto("/sign-in");
  await page.getByTestId("start-demo").click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
  await page.goto("/account");
  const first = await findUserByEmail((await page.getByTestId("account-email").textContent()) ?? "");
  userIds.push(first!.id);
  const { data } = await admin.from("rate_limits").select("key").like("key", "demo-ip:%");
  const key = data![0]!.key;
  const start = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const { error } = await admin.from("rate_limits").upsert([start, start + 3_600_000].map((ms) => ({ key, window_start: new Date(ms).toISOString(), count: 5 })));
  if (error) throw error;
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByTestId("start-demo").click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Too many demo accounts from here this hour. Wait a while and try again.", { timeout: 20_000 });
  await expectNoSeriousA11yIssues(page);
});

test("signing in with no other destination lands on the Write page (Cam, 16 Oct)", async ({ page }) => {
  const email = newEmail();
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  userIds.push(created.data.user!.id);
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  await page.goto(`/auth/confirm?token_hash=${link.data.properties!.hashed_token}&type=email`);
  await expect(page).toHaveURL(/\/app$/);
});

test("an old Google sign-in link or a failed email link says the link expired and offers a demo account", async ({ page }) => {
  for (const error of ["google", "link"]) {
    await page.goto(`/sign-in?error=${error}`);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("That sign-in link has expired. Start a demo account instead.");
    await expect(page.getByTestId("start-demo")).toBeVisible();
  }
  await expectNoSeriousA11yIssues(page);
});

test("an expired or reused link explains what to do", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=not-a-real-token&type=email");
  await expect(page).toHaveURL(/\/sign-in\?error=link$/);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("That sign-in link has expired. Start a demo account instead.");
});

test("the sign-in link (admin-made, no email) signs in and the account page shows the right numbers", async ({ page }) => {
  const user = await signIn(page, userIds);
  await expect(page.getByTestId("account-email")).toHaveText(user.email);
  await expect(page.getByTestId("free-usage")).toHaveText("Your first two rewrites are free. The third is made but locked until the demo checkout.");
  await expect(page.getByTestId("subscription")).toContainText("No subscription yet");
  await expect(page.getByTestId("samples")).toHaveText("0 of 5 saved");
  await expect(page.getByTestId("account-name")).toHaveText("Add your name");
  await expect(page.getByTestId("plan")).toHaveText("Free");
  await expect(page.getByRole("link", { name: "Start writing" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add or edit samples" })).toHaveAttribute("href", "/app?samples=1");
  // The waiting list is gone (R1), and a long email wraps instead of being cut off on phones.
  await expect(page.getByText(/waiting list/)).toHaveCount(0);
  expect(await page.getByTestId("account-email").evaluate((el) => el.closest("p")!.scrollWidth <= el.closest("p")!.clientWidth)).toBe(true);
  await expectNoSeriousA11yIssues(page);

  // Page scripts cannot read the session (T11), and it only travels over HTTPS.
  const session = (await page.context().cookies()).filter((c) => c.name.startsWith("sb-"));
  expect(session.length).toBeGreaterThan(0);
  for (const cookie of session) expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax" });
  expect(await page.evaluate(() => document.cookie)).not.toContain("sb-");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("Settings: a name saved in Profile shows on the Account page, and Usage shows the free rewrites", async ({ page }) => {
  await signIn(page, userIds);
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Usage" }).click();
  await expect(settings.getByTestId("settings-usage")).toContainText("0 of 3 used");
  await settings.getByRole("button", { name: "Profile" }).click();
  await settings.getByLabel("First name").fill("Cam");
  await settings.getByLabel("Surname").fill("Tester");
  await settings.getByRole("button", { name: "Save name" }).click();
  await expect(settings.getByText("Saved.")).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByTestId("account-name")).toHaveText("Cam Tester");
});

test("a guest payment is linked on sign-in and blocks deletion while billing", async ({ page }) => {
  const email = newEmail();
  const subId = `sub_e2e_${randomUUID().slice(0, 8)}`;
  subscriptionIds.push(subId);
  await admin.from("subscriptions").insert({
    email,
    stripe_customer_id: "cus_e2e",
    stripe_subscription_id: subId,
    status: "active",
    livemode: false,
    amount_pence: 500,
    currency: "gbp",
    started_at: new Date().toISOString(),
  });

  const user = await signIn(page, userIds, email);
  await expect(page.getByTestId("subscription")).toContainText("Active");
  const { data } = await admin.from("subscriptions").select("user_id").eq("stripe_subscription_id", subId).single();
  expect(data?.user_id).toBe(user.id);

  await page.getByLabel("I understand this cannot be undone").check();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.locator("#delete-error")).toHaveText("Cancel the test subscription first, using Manage subscription above. Nothing is charged either way.");
  const stillThere = await admin.auth.admin.getUserById(user.id);
  expect(stillThere.data.user?.id).toBe(user.id);
});

test("download my data includes the account and samples", async ({ page }) => {
  const user = await signIn(page, userIds);
  await admin.from("writing_samples").insert({ user_id: user.id, body: "Aye, this is how I write." });
  // full_name and avatar_url are what Supabase keeps from Google when someone continues with Google (G1).
  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { first_name: "Cam", last_name: "Tester", full_name: "Cam Google", avatar_url: "https://lh3.googleusercontent.com/a/test" },
  });
  await page.reload();
  await expect(page.getByTestId("samples")).toHaveText("1 of 5 saved");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download my data" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^polisher-data-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(data.account.email).toBe(user.email);
  expect(data.account.name).toEqual({ first_name: "Cam", last_name: "Tester" });
  expect(data.account.sign_in_methods).toEqual(["email"]);
  expect(data.account.from_google).toEqual({ name: "Cam Google", picture: "https://lh3.googleusercontent.com/a/test" });
  expect(data.writing_samples).toEqual([expect.objectContaining({ body: "Aye, this is how I write.", word_count: 6 })]);
  expect(data.not_stored).toContain("does not save drafts or rewrites");
});

test("delete my account needs the tick box, then removes everything", async ({ page }) => {
  const user = await signIn(page, userIds);
  await admin.from("writing_samples").insert({ user_id: user.id, body: "Delete me." });

  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.locator("#delete-error")).toHaveText("Tick the box to confirm first.");

  await page.getByLabel("I understand this cannot be undone").check();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/account-deleted$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account has been deleted");

  const gone = await admin.auth.admin.getUserById(user.id);
  expect(gone.data.user).toBeNull();
  const samples = await admin.from("writing_samples").select("id").eq("user_id", user.id);
  expect(samples.data).toEqual([]);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("delete my account still works for a demo account made with Start a demo account", async ({ page }) => {
  await admin.from("rate_limits").delete().or("key.like.demo-ip:%,key.eq.demo-all");
  await page.goto("/sign-in?next=/account");
  await page.getByTestId("start-demo").click();
  await expect(page).toHaveURL(/\/account$/, { timeout: 20_000 });
  const email = (await page.getByTestId("account-email").textContent()) ?? "";
  expect(email).toMatch(/@example\.com$/);
  const user = await findUserByEmail(email);
  expect(user).toBeDefined();
  userIds.push(user!.id);
  await admin.from("writing_samples").insert({ user_id: user!.id, body: "Delete me too." });

  await page.getByLabel("I understand this cannot be undone").check();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/account-deleted$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your account has been deleted");
  expect((await admin.auth.admin.getUserById(user!.id)).data.user).toBeNull();
  expect((await admin.from("writing_samples").select("id").eq("user_id", user!.id)).data).toEqual([]);
});

test("signed in, every page's header shows Write, History and Account and the logo goes to the Write page", async ({ page }) => {
  await signIn(page, userIds);
  for (const path of ["/", "/privacy", "/account", "/app"]) {
    await page.goto(path);
    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "Write", exact: true })).toBeVisible();
    await expect(header.getByRole("link", { name: "Account", exact: true })).toBeVisible();
    // History sits between Write and Account (Cam, 16 Oct).
    const x = async (name: string) => (await header.getByRole("link", { name, exact: true }).boundingBox())!.x;
    const [write, history, account] = [await x("Write"), await x("History"), await x("Account")];
    expect(write).toBeLessThan(history);
    expect(history).toBeLessThan(account);
    await expect(header.getByRole("link", { name: "Start a demo account", exact: true })).toHaveCount(0);
    await expect(header.getByRole("link", { name: "Join the waitlist" })).toHaveCount(0);
    await expect(header.getByRole("link", { name: /Polisher home/ })).toHaveAttribute("href", "/app");
  }
});

test("Settings shows Profile and Usage straight away, without waiting for the account to load (Cam, 16 Oct)", async ({ page }) => {
  await signIn(page, userIds);
  // Hold every server action back for 4 seconds; the section list must not wait for it.
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) await new Promise((r) => setTimeout(r, 4_000));
    await route.continue();
  });
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings.getByRole("button", { name: "Profile" })).toBeVisible({ timeout: 1_500 });
  await expect(settings.getByRole("button", { name: "Usage" })).toBeVisible({ timeout: 1_500 });
});

test("signed out, the header offers Start a demo account and no waitlist button", async ({ page }) => {
  for (const path of ["/", "/privacy"]) {
    await page.goto(path);
    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "Start a demo account", exact: true })).toBeVisible();
    await expect(header.getByRole("link", { name: "Join the waitlist" })).toHaveCount(0);
    await expect(header.getByRole("link", { name: /Polisher home/ })).toHaveAttribute("href", "/");
  }
});
