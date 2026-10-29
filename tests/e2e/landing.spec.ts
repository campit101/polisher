// The front page: the offer, the legal pages, and the free taste without an account (R1), against
// polisher-test and its deployed rewrite function in mock mode (nothing paid).
import { admin } from "../integration/supabase-test-project";
import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";
import { findUserByEmail, signIn } from "./sign-in";

const FUNCTION_WAIT = { timeout: 30_000 };
const userIds: string[] = [];
const answer = (n: number) => `Answer ${n}. I keep things short and plain, and I'd rather say it straight than dress it up. ` + Array(50).fill("word").join(" ");
const draft = "Hi Jo,\n\nMoreover, the room is booked for 3pm on Friday and the colour scheme is ready.\n\nThanks,\nCam";
let started = new Date().toISOString();

test.beforeEach(async () => {
  started = new Date().toISOString();
  // Every run comes from the same address, so clear the taste counters on the test project.
  await admin.from("rate_limits").delete().or("key.like.taste-ip:%,key.like.pow:%,key.like.pow-issue:%,key.eq.taste-global");
});

test.afterAll(async () => {
  await admin.from("rate_limits").delete().or("key.like.demo-ip:%,key.eq.demo-all");
  await admin.from("rate_limits").delete().or("key.like.taste-ip:%,key.like.pow:%,key.like.pow-issue:%,key.eq.taste-global");
  // Taste rows have no account and count towards the test project's daily ceiling, so remove them.
  await admin.from("usage_events").delete().is("user_id", null).eq("tier", "free");
  await admin.from("usage_events").delete().in("user_id", userIds);
  for (const id of userIds.splice(0)) await admin.auth.admin.deleteUser(id);
});

// The questions open in a pop-up from the Your writing button, as samples do on the Write page (Cam, 16 Oct).
async function answerThree(page: import("@playwright/test").Page) {
  await page.getByTestId("taste").getByRole("button", { name: /Your writing/ }).click();
  const writing = page.getByRole("dialog", { name: "Your writing" });
  for (let i = 0; i < 3; i++) await writing.locator(`#taste-answer-${i}`).fill(answer(i + 1));
  await expect(writing.getByTestId("taste-progress")).toContainText("3 of 3 answered");
  await writing.getByRole("button", { name: "Done" }).click();
  await expect(writing).toBeHidden();
}

test("landing page shows the offer and stays out of search engines", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your AI drafts, back in your own voice.");
  await expect(page.getByTestId("price")).toHaveText("£5 a month");
  await expect(page.getByTestId("specimen-before")).toContainText("—");
  await expect(page.getByTestId("specimen-after")).toContainText("finalised the colour scheme");
  await expect(page.getByTestId("specimen-after")).not.toContainText("—");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("heading", { name: "Join the waitlist" })).toHaveCount(0);
  await expectNoSeriousA11yIssues(page);

  const robots = await page.request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /");
});

for (const [path, heading] of [
  ["/privacy", "Privacy notice"],
  ["/terms", "Terms"],
  ["/refunds", "Refunds"],
] as const) {
  test(`${path} renders without a draft note (approved by Cam, 16 Oct)`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.getByText("Draft.", { exact: false })).toHaveCount(0);
    await expectNoSeriousA11yIssues(page);
  });
}

test("the free taste: 3 answers and a draft give one full rewrite without an account, then the sign-in pop-up", async ({ page }) => {
  await page.goto("/");
  await answerThree(page);
  await page.getByLabel("Paste an AI draft").fill(draft);
  await expect(page.getByTestId("kind").getByRole("radio", { name: "Email" })).toBeChecked();
  await page.getByTestId("taste-rewrite").click();
  await expect(page.getByTestId("taste-result")).toContainText("4pm on Friday", FUNCTION_WAIT);
  await expect(page.getByTestId("taste-result")).toContainText("Also, the room");
  const dialog = page.getByRole("dialog", { name: "Like it? Start a demo account to keep going" });
  await expect(dialog).toBeVisible();
  // What signing in gives (Cam, 16 Oct): another rewrite, and Create rewrite unlocked, each with a line.
  await expect(dialog.getByTestId("unlock-items")).toContainText("Another rewrite");
  await expect(dialog.getByTestId("unlock-items")).toContainText("Create rewrite unlocked");
  await expect(dialog.getByTestId("start-demo")).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  const { count } = await admin.from("events").select("id", { count: "exact", head: true }).eq("name", "taste_completed").gte("created_at", started);
  expect(count).toBe(1);
  const rows = await admin.from("usage_events").select("user_id, tier").gte("created_at", started).is("user_id", null);
  expect(rows.data?.length).toBe(2);
});

test("the free taste asks for the questions first, before anything is sent, with the progress under the button", async ({ page }) => {
  // Counts this page's own server calls, so other tests' free tries running at the same time do not count.
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) sent.push(request.url());
  });
  await page.goto("/");
  const button = page.getByTestId("taste").getByRole("button", { name: /Your writing/ });
  await expect(button).toHaveAccessibleName(/required/);
  await page.getByLabel("Paste an AI draft").fill(draft);
  await page.getByTestId("taste-rewrite").click();
  // The reason in red under the button; the pop-up stays shut until asked for.
  const writing = page.getByRole("dialog", { name: "Your writing" });
  await expect(writing).toBeHidden();
  const need = page.getByTestId("taste-need");
  await expect(need).toContainText("Answer at least 3 of the questions under Your writing first");
  await expect(need).toContainText("0 of 3 answered, 0 words so far (150 needed)");
  // Three short answers: still not enough words, and the message says so.
  await need.getByRole("button", { name: "Open Your writing" }).click();
  for (let i = 0; i < 3; i++) await writing.locator(`#taste-answer-${i}`).fill("Just a few words here.");
  await writing.getByRole("button", { name: "Done" }).click();
  await expect(writing).toBeHidden();
  await expect(need).toContainText("3 of 3 answered, 15 words so far (150 needed)");
  expect(sent).toEqual([]);
});

test("signing in after a taste saves the answers as samples and counts the free try as the first of 3 free rewrites", async ({ page }) => {
  await page.goto("/");
  await answerThree(page);
  await page.getByLabel("Paste an AI draft").fill(draft);
  await page.getByTestId("taste-rewrite").click();
  await expect(page.getByTestId("taste-result")).toBeVisible(FUNCTION_WAIT);
  const user = await signIn(page, userIds);
  await page.goto("/app");
  await expect(page.getByTestId("taste-carried")).toContainText("3", FUNCTION_WAIT);
  const samples = await admin.from("writing_samples").select("body").eq("user_id", user.id).order("created_at").order("id");
  expect(samples.data).toHaveLength(3);
  // Saved in the order they were answered (the walkthrough found them shuffled, 16 Oct).
  expect(samples.data?.map((s) => s.body.slice(0, 8))).toEqual(["Answer 1", "Answer 2", "Answer 3"]);
  const profile = await admin.from("profiles").select("free_rewrites_used").eq("id", user.id).single();
  expect(profile.data).toEqual({ free_rewrites_used: 1 });
  const { count } = await admin.from("events").select("id", { count: "exact", head: true }).eq("name", "taste_to_signup").gte("created_at", started);
  expect(count).toBe(1);
  // Once only: a reload does not save them again.
  await page.reload();
  await expect(page.getByTestId("taste-carried")).toHaveCount(0);
  expect((await admin.from("writing_samples").select("id").eq("user_id", user.id)).data).toHaveLength(3);
});

test("starting a demo account from the pop-up after a taste lands on the Write page with the answers saved as samples", async ({ page }) => {
  await admin.from("rate_limits").delete().or("key.like.demo-ip:%,key.eq.demo-all");
  await page.goto("/");
  await answerThree(page);
  await page.getByLabel("Paste an AI draft").fill(draft);
  await page.getByTestId("taste-rewrite").click();
  await expect(page.getByTestId("taste-result")).toBeVisible(FUNCTION_WAIT);
  const dialog = page.getByRole("dialog", { name: "Like it? Start a demo account to keep going" });
  await expect(dialog).toBeVisible();
  // Pressed at once: the form waits out the bot check itself, counted from its newest token (fixed 29 Oct).
  await dialog.getByTestId("start-demo").click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
  await expect(page.getByTestId("taste-carried")).toContainText("3", FUNCTION_WAIT);
  await page.goto("/account");
  const found = await findUserByEmail((await page.getByTestId("account-email").textContent()) ?? "");
  expect(found).toBeDefined();
  userIds.push(found!.id);
  const samples = await admin.from("writing_samples").select("body").eq("user_id", found!.id);
  expect(samples.data).toHaveLength(3);
});

test("front page: new words, students line, Q&A, the draft types explained in How it works, the demo byline and no address strip", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByTestId("hero-intro")).toHaveText(
    "Paste a draft from any AI. Polisher rewrites it in your own voice and strips out the usual AI phrasing and formatting.",
  );
  // The students line sits by the price only, not under the headline (Cam, 17 Oct).
  await expect(page.getByTestId("students")).toHaveCount(1);
  await expect(page.locator("#price").getByTestId("students")).toHaveText("Demo checkout: Stripe test mode only");
  await expect(page.getByText("Common AI phrasing and formatting")).toBeVisible();
  await expect(page.getByText("An example is long dashes.")).toBeVisible();
  await expect(page.getByText("Spelling toggle")).toBeVisible();
  await expect(page.getByText("organize", { exact: true })).toHaveCount(0);
  if (!isMobile) await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Q&A" })).toBeVisible();

  // The same tool as the Write page, with Create rewrite locked until signing in (Cam, 16 Oct).
  const taste = page.getByTestId("taste");
  await expect(taste.getByRole("radio", { name: "Rewrite AI draft" })).toBeChecked();
  await expect(taste.getByTestId("locked-create")).toContainText("Create rewrite");
  await expect(taste.getByTestId("locked-create")).toContainText("Start a demo account to unlock");
  await expect(taste.getByText("0 words of 300")).toBeVisible();
  await expect(taste.getByText("Polisher never saves drafts or rewrites.")).toBeVisible();
  // Strangers can see the try is free before they start (Cam, 21 Oct).
  await expect(taste.getByTestId("taste-free")).toHaveText("Your first rewrite is free, with no account. Free drafts can be up to 300 words, or 1,000 with the demo plan.");
  await expect(page.getByTestId("taste-rewrite")).toHaveText("Rewrite");
  await taste.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByLabel("Paste an AI draft")).not.toHaveValue("");
  await taste.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByLabel("Paste an AI draft")).toHaveValue("");

  // Work is chosen until a draft suggests another type, and the required mark is a bare, slightly larger * (Cam, 16 Oct).
  await expect(page.getByTestId("taste").getByRole("radio", { name: "Work" })).toBeChecked();
  const star = page.getByTestId("writing-required");
  expect(await star.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe("none");
  expect(Number.parseFloat(await star.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThan(12);

  // The small ? badges are gone from the tool (Cam, 16 Oct); How it works explains each type instead.
  await expect(page.getByTestId("taste").getByRole("button", { name: /What is .* for\?/ })).toHaveCount(0);
  const how = page.locator("#how");
  for (const [name, text] of <const>[
    ["Work", "Essays, reports, questionnaires"],
    ["Email", "greeting and sign-off"],
    ["Text", "friends and family"],
    ["Article", "blog or LinkedIn"],
  ]) {
    await expect(how.getByTestId("kind-explained").getByRole("term").filter({ hasText: name })).toBeVisible();
    await expect(how.getByTestId("kind-explained")).toContainText(text);
  }

  // No struck-through example bubbles under What it takes out.
  await expect(page.locator("#removes del")).toHaveCount(0);

  // The address sits in its own strip at the very bottom of the footer, not under the email (Cam, 16 Oct).
  const footer = page.getByRole("contentinfo");
  const byline = footer.getByText("Polisher, a working demo by Cameron Pittaway, Aberdeen, Scotland.", { exact: true });
  await expect(byline).toBeVisible();
  // Nothing is sold, so the demo shows no postal address strip (29 Oct).
  await expect(footer.getByTestId("footer-address")).toHaveCount(0);
  const bylineBox = (await byline.boundingBox())!;
  const footerBox = (await footer.boundingBox())!;
  expect(footerBox.y + footerBox.height - (bylineBox.y + bylineBox.height)).toBeLessThan(160);
  await expectNoSeriousA11yIssues(page);
});

test("the free taste: results stay on the Polish tab, Copy says Copied!, and American spelling comes back when chosen", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Writing" }).click();
  await settings.getByRole("radio", { name: "American" }).check();
  await page.keyboard.press("Escape");

  await answerThree(page);
  await expect(page.getByTestId("taste").getByRole("button", { name: /Your writing/ })).toHaveAccessibleName(/done/);
  await page.getByLabel("Paste an AI draft").fill("Hi Jo,\n\nThe colour scheme for 3pm on Friday is finalised.\n\nThanks,\nCam");
  await page.getByTestId("taste-rewrite").click();
  const result = page.getByTestId("taste-result");
  await expect(result).toContainText("The color scheme for 4pm on Friday is finalized.", FUNCTION_WAIT);
  await page.getByRole("dialog", { name: "Like it? Start a demo account to keep going" }).getByRole("button", { name: "Not now" }).click();
  await expect(page.getByTestId("changes")).toContainText("changed to American spelling");
  // What the clean-up changed comes before Check these.
  const changes = await page.getByTestId("changes").boundingBox();
  const checks = await page.getByTestId("checks").boundingBox();
  expect(changes!.y).toBeLessThan(checks!.y);

  const copy = page.getByTestId("taste").getByRole("button", { name: "Copy" });
  await copy.click();
  await expect(page.getByTestId("taste").getByRole("button", { name: "Copied!" })).toBeVisible();
  await expect(page.getByTestId("taste").getByRole("button", { name: "Copy" })).toBeVisible({ timeout: 4_000 });

  // Opening and closing Your writing leaves the result where it is.
  await page.getByTestId("taste").getByRole("button", { name: /Your writing/ }).click();
  await page.getByRole("dialog", { name: "Your writing" }).getByRole("button", { name: "Done" }).click();
  await expect(result).toBeVisible();
});

test("signed out, Create rewrite is locked and opens the sign-in pop-up; free drafts stop at 300 words (Cam, 16 Oct)", async ({ page }) => {
  await page.goto("/");
  const taste = page.getByTestId("taste");
  await taste.getByTestId("locked-create").click();
  const dialog = page.getByRole("dialog", { name: "Start a demo account to unlock Create rewrite" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("unlock-items")).toContainText("Create rewrite unlocked");
  await expect(dialog.getByTestId("start-demo")).toBeVisible();
  // The pop-up offers the one demo button: no email box and no Google.
  await expect(dialog.getByLabel("Email address")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  await expect(dialog).toContainText("There is no email address and no password");
  await expectNoSeriousA11yIssues(page);
  await dialog.getByRole("button", { name: "Not now" }).click();
  await expect(taste.getByRole("radio", { name: "Rewrite AI draft" })).toBeChecked();

  await page.getByLabel("Paste an AI draft").fill(Array.from({ length: 301 }, (_, i) => `word${i}`).join(" "));
  await expect(taste.getByText("Free drafts can be up to 300 words.")).toBeVisible();
  await expect(page.getByTestId("taste-rewrite")).toBeDisabled();
});

test("signed in, the front page points to the Write page instead of the taste, centred in its box", async ({ page }) => {
  await signIn(page, userIds);
  await page.goto("/");
  const card = page.getByTestId("taste-signed-in");
  const link = card.getByRole("link", { name: "Open the Write page" });
  await expect(link).toBeVisible();
  const cardBox = (await card.boundingBox())!;
  const linkBox = (await link.boundingBox())!;
  expect(Math.abs(cardBox.x + cardBox.width / 2 - (linkBox.x + linkBox.width / 2))).toBeLessThan(2);
  expect(await card.locator("p").evaluate((el) => getComputedStyle(el).textAlign)).toBe("center");
});

test("signed in, the page arrives with the signed-in card and no free-try box to flash first", async ({ page }) => {
  await signIn(page, userIds);
  const html = await (await page.request.get("/")).text();
  expect(html).toContain('data-testid="taste-signed-in"');
  expect(html).not.toContain('data-testid="taste"');
});

test("signed in with a subscription, the price card says Subscribed instead of Subscribe", async ({ page }) => {
  const user = await signIn(page, userIds);
  await admin.from("subscriptions").insert({
    email: user.email,
    user_id: user.id,
    stripe_customer_id: "cus_e2elanding",
    stripe_subscription_id: `sub_e2elanding_${user.id}`,
    status: "active",
    livemode: false,
    // Two days ago: outside any kill-test window the admin tests run in parallel (16 Oct).
    started_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  });
  try {
    await page.goto("/");
    const price = page.locator("#price");
    await expect(price.getByTestId("subscribed")).toHaveText("Subscribed");
    // Already in the page as it arrives, so Subscribe never flashes first.
    expect(await (await page.request.get("/")).text()).toContain('data-testid="subscribed"');
    await expect(price.getByTestId("subscribe")).toHaveCount(0);
    await expect(price.getByRole("link", { name: "Manage it on your Account page" })).toHaveAttribute("href", "/account#billing");
    await expectNoSeriousA11yIssues(page);
  } finally {
    await admin.from("subscriptions").delete().eq("stripe_subscription_id", `sub_e2elanding_${user.id}`);
  }
});

test("signed in without a subscription, the price card still offers Subscribe", async ({ page }) => {
  await signIn(page, userIds);
  await page.goto("/");
  await expect(page.locator("#price").getByTestId("subscribe")).toBeVisible();
  await expect(page.locator("#price").getByTestId("subscribed")).toHaveCount(0);
});

test("moving to another page starts at the top, not part-way down (Cam, 16 Oct)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  await page.getByRole("contentinfo").getByRole("link", { name: "Terms", exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terms");
  // Give any smooth scroll time to finish, then the page must be at the very top.
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("the front-page tool is one neat block on a narrow phone and on desktop (Cam, 17 Oct)", async ({ page, isMobile }) => {
  if (isMobile) await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const taste = page.getByTestId("taste");
  const box = async (locator: import("@playwright/test").Locator) => (await locator.boundingBox())!;
  const draftTab = await box(taste.locator("label").filter({ hasText: "Rewrite AI draft" }));
  const lockedTab = await box(taste.getByTestId("locked-create"));
  const writing = await box(taste.getByRole("button", { name: /Your writing/ }));
  const mode = await box(taste.getByTestId("mode"));
  const card = await box(taste);
  // Both tabs on one line, inside the card, with no spill.
  expect(Math.abs(lockedTab.y - draftTab.y)).toBeLessThan(2);
  expect(mode.x + mode.width).toBeLessThanOrEqual(card.x + card.width);
  // The locked tab still tells screen readers why it is locked.
  await expect(taste.getByTestId("locked-create")).toHaveAccessibleName(/Create rewrite.*Start a demo account to unlock/);
  if (isMobile) {
    // Your writing sits straight under the tabs, as wide as them.
    expect(writing.y - (mode.y + mode.height)).toBeLessThan(16);
    expect(Math.abs(writing.width - mode.width)).toBeLessThan(2);
  } else {
    // Beside the tabs on a wide screen, level with them.
    expect(writing.x).toBeGreaterThan(mode.x + mode.width);
    expect(Math.abs(writing.y + writing.height / 2 - (mode.y + mode.height / 2))).toBeLessThan(4);
  }
  // The privacy line is the last line of the tool, under Rewrite, and only says what Polisher does.
  const rewrite = await box(page.getByTestId("taste-rewrite"));
  const line = taste.getByTestId("not-stored");
  await expect(line).toHaveText("Polisher never saves drafts or rewrites.");
  expect((await box(line)).y).toBeGreaterThan(rewrite.y + rewrite.height);
  await expectNoSeriousA11yIssues(page);
});

test("the hero is the heading and one paragraph, with the tool straight after it (Cam, 19 Oct)", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator('section[aria-labelledby="hero-heading"]');
  await expect(hero.locator("#hero-heading ~ p")).toHaveCount(1);
  await expect(hero.getByTestId("hero-intro")).toBeVisible();
  // The free-try line left the hero text on 19 Oct; since 21 Oct it sits under the tool's Rewrite button instead.
  await expect(hero.locator("#hero-heading ~ p").getByText("Your first rewrite is free")).toHaveCount(0);
  await expect(page.getByTestId("taste").getByTestId("taste-free")).toContainText("Your first rewrite is free, with no account.");
});
