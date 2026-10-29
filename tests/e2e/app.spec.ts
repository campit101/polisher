// The app page against polisher-test and its deployed "rewrite" function (mock AI, nothing paid).
import { admin } from "../integration/supabase-test-project";
import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";
import { signIn } from "./sign-in";

const userIds: string[] = [];
// The deployed function can take several seconds from cold; the page itself says 10 to 30 seconds.
const FUNCTION_WAIT = { timeout: 30_000 };
const answer = (n: number) => `Answer ${n}. I normally keep things short and plain, and I'd rather say it straight than dress it up. ` + Array(100).fill("word").join(" ");
const sample = (n: number) => `Sample ${n}. ` + Array(110).fill("word").join(" ");
const draft = "Hi Jo,\n\nMoreover, the color scheme costs £450 and \"we will leverage the data\" as agreed. Thanks for organizing it all.";

// Five samples fill every slot, so the samples pop-up stays shut and the tool can be used straight away.
async function withSamples(page: Parameters<typeof signIn>[0], count = 5, body = sample) {
  const user = await signIn(page, userIds);
  await admin.from("writing_samples").insert(Array.from({ length: count }, (_, i) => ({ user_id: user.id, body: body(i + 1) })));
  await page.goto("/app");
  return user;
}

async function subscribe(userId: string, email: string) {
  await admin.from("subscriptions").insert({
    email,
    user_id: userId,
    stripe_customer_id: "cus_e2eapp",
    stripe_subscription_id: `sub_e2eapp_${userId}`,
    status: "active",
    livemode: false,
    // Two days ago: outside any kill-test window the admin tests run in parallel (16 Oct).
    started_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    current_period_start: new Date(Date.now() - 86_400_000).toISOString(),
    current_period_end: new Date("2099-11-01T09:00:00Z").toISOString(),
  });
}

test.afterAll(async () => {
  await admin.from("subscriptions").delete().like("stripe_subscription_id", "sub_e2eapp_%");
  // Usage rows outlive deleted accounts and count towards the test project's $1 daily ceiling.
  await admin.from("usage_events").delete().in("user_id", userIds);
  for (const id of userIds.splice(0)) await admin.auth.admin.deleteUser(id);
  await admin.from("rate_limits").delete().like("key", "rewrite-ip:%");
});

test("History keeps the last 5 rewrites from both tools in this browser, newest first and labelled, and signing out clears it (Cam, 16 Oct)", async ({ page }) => {
  const user = await withSamples(page);
  await subscribe(user.id, user.email);
  const key = `polisher-history:${user.id}`;
  // Five older entries, so the next rewrite pushes the oldest out.
  await page.evaluate((k) => {
    const old = Array.from({ length: 5 }, (_, i) => ({ id: `old-${i}`, mode: "draft", draft: `Old draft ${i}`, text: `Old rewrite ${i}`, at: new Date(Date.now() - (i + 1) * 60_000).toISOString() }));
    localStorage.setItem(k, JSON.stringify(old));
  }, key);
  await page.reload();
  await page.getByRole("radio", { name: "Create rewrite" }).check();
  await page.getByRole("textbox", { name: "Create in your voice" }).fill("cant make football thurs, covering a late shift. pitches free 7pm");
  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("result-text")).toBeVisible(FUNCTION_WAIT);

  await page.locator("header").getByRole("link", { name: "History", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  const items = page.getByTestId("history-item");
  await expect(items).toHaveCount(5);
  await expect(items.first()).toContainText("Create rewrite");
  await expect(items.first()).toContainText("pitches free 8pm");
  await expect(items.nth(1)).toContainText("Rewrite AI draft");
  await expect(page.getByText("Old rewrite 4")).toHaveCount(0);
  await expect(items.first().getByRole("button", { name: "Copy" })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
});

test("after paying, the subscribed notice fades away after a few seconds and does not come back on refresh (Cam, 16 Oct)", async ({ page }) => {
  const user = await withSamples(page);
  await subscribe(user.id, user.email);
  await page.goto("/app?subscribed=1");
  const notice = page.getByTestId("subscribed-notice");
  await expect(notice).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  await expect(notice).toHaveCount(0, { timeout: 9_000 });
  await page.reload();
  await expect(page.getByLabel("Paste an AI draft")).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("each tool has Try an example and Clear, the page is called Write, and drafts stop at 300 words free and 1,000 subscribed (Cam, 16 Oct)", async ({ page }) => {
  const user = await withSamples(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Write");
  const box = page.getByRole("textbox", { name: "Paste an AI draft" });
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(box).not.toHaveValue("");
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(box).toHaveValue("");
  await expect(page.getByText("0 words of 300")).toBeVisible();
  await box.fill(Array(301).fill("word").join(" "));
  await expect(page.getByText("Free drafts can be up to 300 words.")).toBeVisible();
  await expect(page.getByTestId("rewrite")).toBeDisabled();
  await subscribe(user.id, user.email);
  await page.reload();
  await expect(page.getByText("0 words of 1,000")).toBeVisible();
  await page.getByRole("textbox", { name: "Paste an AI draft" }).fill(Array(1001).fill("word").join(" "));
  await expect(page.getByTestId("rewrite")).toBeDisabled();
  await page.getByRole("radio", { name: "Create rewrite" }).check();
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByRole("textbox", { name: "Create in your voice" })).not.toHaveValue("");
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp|\/sign-in\?next=\/app/);
});

test("the Write page puts the tool first, with samples in a pop-up that opens when writing is missing", async ({ page }) => {
  await signIn(page, userIds);
  await page.goto("/app");
  const samples = page.getByRole("dialog", { name: "Write in your own voice" });
  await expect(samples).toBeVisible();
  await expect(samples).toContainText("come back any time from Settings or your Account page");
  await expectNoSeriousA11yIssues(page);
  await samples.getByRole("button", { name: "Done" }).click();
  await expect(samples).toBeHidden();
  await expect(page.getByLabel("Paste an AI draft")).toBeVisible();
  await page.getByRole("button", { name: /Edit samples/ }).click();
  await expect(samples).toBeVisible();
});

test("with every sample slot filled the pop-up stays shut, and the Account page link opens it", async ({ page }) => {
  await withSamples(page);
  const samples = page.getByRole("dialog", { name: "Write in your own voice" });
  await expect(page.getByLabel("Paste an AI draft")).toBeVisible();
  await expect(samples).toBeHidden();
  await page.goto("/account");
  await page.getByRole("link", { name: "Add or edit samples" }).click();
  await expect(page).toHaveURL(/\/app\?samples=1$/);
  await expect(samples).toBeVisible();
  await expect(samples.getByLabel("Sample 1")).toBeVisible();
});

test("with the free try's amount of writing, rewriting works and the pop-up only nudges once a visit about empty slots", async ({ page }) => {
  // 3 samples, 168 words: over the 150 the free try needs, under the old 300 (Cam, 16 Oct).
  await withSamples(page, 3, (n) => `Sample ${n}. ` + Array(54).fill("word").join(" "));
  const samples = page.getByRole("dialog", { name: "Write in your own voice" });
  await expect(samples).toBeVisible();
  await expect(samples.getByTestId("samples-status")).toHaveText("Ready. You have 2 empty sample slots. Fill them in to get better results.");
  await samples.getByRole("button", { name: "Done" }).click();
  await page.getByRole("textbox", { name: "Paste an AI draft" }).fill(draft);
  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("result-text")).toBeVisible(FUNCTION_WAIT);
  // Once a visit: a reload in the same tab leaves it shut.
  await page.reload();
  await expect(page.getByLabel("Paste an AI draft")).toBeVisible();
  await expect(samples).toBeHidden();
});

test("too little writing: the button stays off and says exactly how much more is needed", async ({ page }) => {
  await withSamples(page, 3, (n) => `Sample ${n} is short.`);
  const samples = page.getByRole("dialog", { name: "Write in your own voice" });
  await expect(samples.getByTestId("samples-status")).toHaveText("Add 138 more words to start.");
  await samples.getByRole("button", { name: "Done" }).click();
  await page.getByRole("textbox", { name: "Paste an AI draft" }).fill(draft);
  await expect(page.getByTestId("rewrite")).toBeDisabled();
  await expect(page.getByTestId("needs-samples")).toHaveText("Add 138 more words to start. Use Edit samples above.");
  // The Write page has History, so its privacy line says where the last 5 are kept (17 Oct).
  await expect(page.getByTestId("not-stored")).toHaveText(
    "Polisher's servers never save drafts or rewrites. Your last 5 rewrites stay in History, in this browser only.",
  );
  // Not every visit can be skipped: below the minimum it opens again.
  await page.reload();
  await expect(samples).toBeVisible();
});

test("American spelling from Settings reaches the Write page's rewrites", async ({ page }) => {
  await withSamples(page);
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Writing" }).click();
  await settings.getByRole("radio", { name: "American" }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "Paste an AI draft" }).fill(draft);
  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("result-text")).toContainText("the color scheme costs £451", FUNCTION_WAIT);
  await expect(page.getByTestId("result-text")).toContainText("Thanks for organizing it all.");
});

test("answering the questions saves samples and unlocks the rewrite button", async ({ page }) => {
  await signIn(page, userIds);
  await page.goto("/app");
  await expect(page.getByTestId("samples-status")).toHaveText("Add 3 more samples and 150 more words to start.");
  await expect(page.getByTestId("rewrite")).toBeDisabled();
  // The questions are tucked away, not shown on first load.
  await expect(page.getByLabel(/Tell a friend/)).toBeHidden();
  await page.getByText("No samples to hand? Answer 5 questions instead").click();
  for (const n of [0, 1, 2]) await page.locator(`#answer-${n}`).fill(answer(n));
  await page.getByRole("button", { name: "Save my answers" }).click();
  await expect(page.getByTestId("samples-status")).toHaveText("Ready. You have 2 empty sample slots. Fill them in to get better results.");
  await expect(page.getByTestId("samples-progress")).toContainText("3 samples");
  await expect(page.getByTestId("rewrite")).toBeDisabled(); // no draft yet
  await page.getByRole("dialog", { name: "Write in your own voice" }).getByRole("button", { name: "Done" }).click();
  await page.getByRole("textbox", { name: "Paste an AI draft" }).fill(draft);
  await expect(page.getByTestId("rewrite")).toBeEnabled();
  await expectNoSeriousA11yIssues(page);
});

test("samples can be added, edited and deleted", async ({ page }) => {
  await signIn(page, userIds);
  await page.goto("/app");
  await page.getByLabel("Paste or type a sample").fill("My first sample, short and sweet.");
  await page.getByRole("button", { name: "Save sample" }).click();
  await expect(page.getByTestId("samples-progress")).toHaveText("1 sample, 6 words in total.");
  await expect(page.getByLabel("Paste or type a sample")).toHaveValue("");
  await page.getByLabel("Sample 1").fill("Edited sample with five words.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("samples-progress")).toHaveText("1 sample, 5 words in total.");
  await page.getByTestId("delete-sample").click();
  await expect(page.getByTestId("samples-progress")).toHaveText("0 samples, 0 words in total.");
});

test("free tier: two rewrites shown with their checks, the third locked and opened after subscribing (launch decision 3)", async ({ page }) => {
  const user = await withSamples(page);
  await expect(page.getByTestId("free-usage")).toContainText("Your first two rewrites are free");
  await expect(page.getByTestId("next-locked")).toHaveCount(0);

  await page.getByRole("textbox", { name: "Paste an AI draft" }).fill(draft);
  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("result-text")).toHaveText(
    'Hi Jo,\n\nAlso, the colour scheme costs £451 and "we will leverage the data" as agreed. Thanks for organising it all.',
    FUNCTION_WAIT,
  );
  await expect(page.getByTestId("changes")).toContainText("1 quotation left exactly as written");
  await expect(page.getByTestId("checks")).toContainText("£450");
  await expect(page.getByTestId("free-usage")).toContainText("Free rewrite 1 of 3 used");
  await expectNoSeriousA11yIssues(page);

  // The second is shown in full too; then the page says the next one will be locked, before it is made.
  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("free-usage")).toContainText("Free rewrite 2 of 3 used", FUNCTION_WAIT);
  await expect(page.getByTestId("result-text")).toContainText("the colour scheme costs £451");
  await expect(page.getByTestId("next-locked")).toHaveText("Your next rewrite will be made but locked until the demo checkout.");

  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("locked")).toContainText("This rewrite is locked until the demo checkout", FUNCTION_WAIT);
  await expect(page.getByTestId("locked-preview")).toHaveText(/^Hi Jo,[\s•]+$/);
  await expect(page.getByTestId("locked").getByTestId("subscribe")).toBeVisible();
  await expect(page.getByTestId("locked")).toContainText("Demo only. Nothing is charged for real.");
  // Not said twice: the waiting card only appears on later visits.
  await expect(page.getByTestId("locked-waiting")).toHaveCount(0);

  // All three used: the button stops, and the page says why (the walkthrough found it still active, 16 Oct).
  await expect(page.getByTestId("rewrite")).toBeDisabled();
  await expect(page.getByTestId("free-used-up")).toHaveText("All 3 free rewrites used. Try the demo checkout to keep going.");
  // One Subscribe button at a time: the locked card has it, so the used-up line does not repeat it.
  await expect(page.getByTestId("subscribe")).toHaveCount(1);
  // Subscribe is its own form, so it must sit outside the Rewrite form (nested forms broke the page on reload).
  await page.reload();
  await expect(page.getByTestId("free-used-up")).toBeVisible();
  await expect(page.getByTestId("locked-waiting")).toBeVisible();
  await expect(page.getByTestId("subscribe")).toHaveCount(1);
  // On the other tab there is no locked card, so the used-up line offers Subscribe itself.
  await page.getByRole("radio", { name: "Create rewrite" }).check();
  await expect(page.getByTestId("subscribe")).toHaveCount(1);
  await expect(page.getByTestId("locked-waiting")).toHaveCount(0);
  await page.getByRole("radio", { name: "Rewrite AI draft" }).check();
  expect(await page.locator("form form").count()).toBe(0);

  // Back from Stripe: the locked rewrite opens by itself in the tool it was made in (Cam, 16 Oct).
  await subscribe(user.id, user.email);
  await page.goto("/app");
  await expect(page.getByRole("radio", { name: "Rewrite AI draft" })).toBeChecked();
  await expect(page.getByTestId("result-text")).toContainText("the colour scheme costs £451", FUNCTION_WAIT);
  await expect(page.getByTestId("locked-waiting")).toHaveCount(0);
  // Not kept on the page: a reload shows an empty tool, and History has it.
  await page.reload();
  await expect(page.getByLabel("Paste an AI draft")).toBeVisible();
  await expect(page.getByTestId("result-text")).toHaveCount(0);
  await page.goto("/history");
  await expect(page.getByTestId("history-item").first()).toContainText("the colour scheme costs £451");
});

test("a locked rewrite waits in its own tool, not at the top of the page", async ({ page }) => {
  await withSamples(page);
  await page.getByRole("radio", { name: "Create rewrite" }).check();
  await page.getByRole("textbox", { name: "Create in your voice" }).fill("cant make football thurs, covering a late shift. sat instead? pitches free 7pm");
  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("result-text")).toBeVisible(FUNCTION_WAIT);
  await page.getByRole("textbox", { name: "Create in your voice" }).fill("running late, be there 8pm instead of 7. save me a seat");
  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("free-usage")).toContainText("2 of 3 used", FUNCTION_WAIT);
  await page.getByRole("textbox", { name: "Create in your voice" }).fill("cheers for lending me the drill, will drop it back sat morning");
  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("locked")).toBeVisible(FUNCTION_WAIT);
  // A later visit: the waiting card sits in the Create tool, not above the tabs.
  await page.reload();
  await expect(page.getByRole("radio", { name: "Create rewrite" })).toBeChecked();
  const waiting = page.getByTestId("locked-waiting");
  await expect(waiting).toBeVisible();
  const tabs = (await page.getByTestId("mode").boundingBox())!;
  expect((await waiting.boundingBox())!.y).toBeGreaterThan(tabs.y);
});

test("paid: credits by the word, the usage card as Cam's mock-up, and the daily limit with exact numbers (Cam, 16 Oct)", async ({ page }) => {
  const user = await withSamples(page);
  await subscribe(user.id, user.email);
  await page.reload();
  // Usage sits behind a small ring by the tool (Cam, 16 Oct), not in the way.
  const popover = page.getByTestId("usage-popover");
  await expect(popover).toBeHidden();
  await page.getByRole("button", { name: /^Usage/ }).click();
  await expect(popover).toBeVisible();
  await expect(popover.getByRole("heading", { name: "Usage" })).toBeVisible();
  // The share left large, whole credits small (Cam's mock-up).
  await expect(page.getByTestId("usage-today")).toHaveText("100% left");
  await expect(page.getByTestId("usage-today-credits")).toHaveText("60/60 credits");
  await expect(page.getByTestId("usage-month")).toHaveText("100% left");
  await expect(page.getByTestId("usage-month-credits")).toHaveText("300/300 credits");
  // The draft is under 50 words, so it counts as 50: half a credit.
  await page.getByRole("textbox", { name: "Paste an AI draft" }).fill(draft);
  await expect(page.getByTestId("draft-credits")).toHaveText("Uses 0.5 credits");
  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("result-text")).toBeVisible(FUNCTION_WAIT);
  await expect(page.getByTestId("usage-today")).toHaveText("99% left");
  await expect(page.getByTestId("usage-today-credits")).toHaveText("59/60 credits");
  await expect(page.getByTestId("usage-month-credits")).toHaveText("299/300 credits");

  // 5,550 more words today leaves 400 (4 credits); a 600-word draft uses 6, so it is refused before any AI call.
  await admin.from("usage_events").insert([
    { user_id: user.id, kind: "rewrite", tier: "paid", outcome: "mock", cost_usd: 0, charged_words: 5000 },
    { user_id: user.id, kind: "rewrite", tier: "paid", outcome: "mock", cost_usd: 0, charged_words: 550 },
  ]);
  await page.getByRole("textbox", { name: "Paste an AI draft" }).fill(Array.from({ length: 600 }, (_, i) => `word${i}`).join(" "));
  await expect(page.getByTestId("draft-credits")).toHaveText("Uses 6 credits");
  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("limit")).toHaveText(
    "This draft uses 6 credits and you have 4 credits left today. Shorten it to 400 words or fewer, or wait until midnight UK time.",
    FUNCTION_WAIT,
  );
  await expect(page.getByTestId("usage-today")).toHaveText("6% left");
  await expect(page.getByTestId("usage-today-credits")).toHaveText("4/60 credits");

  // Settings, Usage: the same style, share left large and credits small.
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByRole("button", { name: "Usage" }).click();
  await expect(settings.getByTestId("settings-usage")).toContainText("6% left");
  await expect(settings.getByTestId("settings-usage")).toContainText("4/60 credits");
  await expect(settings.getByRole("progressbar", { name: "This month" })).toHaveAttribute("aria-valuetext", "81% left, 244/300 credits");
  await expect(settings.getByText("How many credits you have left.")).toBeVisible();
});

test("the samples pop-up opens once a visit, even after it first opened because writing was missing (16 Oct)", async ({ page }) => {
  const user = await withSamples(page, 2);
  const dialog = page.getByTestId("samples");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  // Now there is enough writing, with slots still empty: the once-a-visit nudge has already happened.
  await admin.from("writing_samples").insert({ user_id: user.id, body: sample(3) });
  await page.reload();
  await expect(page.getByLabel("Paste an AI draft")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(dialog).toBeHidden();
});

test("a refused draft shows a plain message and costs nothing", async ({ page }) => {
  const user = await withSamples(page);
  await page.getByRole("textbox", { name: "Paste an AI draft" }).fill("Please MOCK_REFUSE this draft.");
  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("rewrite-error")).toHaveText("The AI wouldn't rewrite this draft. Nothing was charged. Try rewording it.", FUNCTION_WAIT);
  const { data } = await admin.from("profiles").select("free_rewrites_used").eq("id", user.id).single();
  expect(data).toEqual({ free_rewrites_used: 0 });
});

test("two tools on two tabs: each keeps its own text and result, shown straight under its button (Cam, 16 Oct)", async ({ page }) => {
  // A subscriber, so both rewrites come back in full (a second free one would be locked).
  const user = await withSamples(page);
  await subscribe(user.id, user.email);
  await page.reload();
  const draftTab = page.getByRole("radio", { name: "Rewrite AI draft" });
  const createTab = page.getByRole("radio", { name: "Create rewrite" });
  await expect(draftTab).toBeChecked();
  await expect(page.getByRole("button", { name: "Rewrite", exact: true })).toBeVisible();

  // The draft tool first.
  await page.getByRole("textbox", { name: "Paste an AI draft" }).fill(draft);
  await page.getByTestId("rewrite").click();
  await expect(page.getByTestId("result-text")).toContainText("£451", FUNCTION_WAIT);
  // Straight under the button (the usage ring sits beside the word count above it).
  const button = (await page.getByTestId("rewrite").boundingBox())!;
  const result = (await page.getByTestId("result").boundingBox())!;
  const usage = (await page.getByRole("button", { name: /^Usage/ }).boundingBox())!;
  expect(result.y).toBeGreaterThan(button.y + button.height);
  expect(result.y).toBeGreaterThan(usage.y);

  // The create tool has its own empty box and no result from the other tab.
  await createTab.check();
  const box = page.getByRole("textbox", { name: "Create in your voice" });
  await expect(box).toHaveValue("");
  await expect(page.getByTestId("result")).toHaveCount(0);
  await expect(page.getByText("Write down your own short draft and Polisher rewrites it as a complete message in your own words.")).toBeVisible();
  await box.fill("cant make football thurs, covering a late shift. sat instead? pitches free 7pm, £6 each");
  await page.getByRole("button", { name: "Create rewrite" }).click();
  await expect(page.getByRole("heading", { name: "Your message" })).toBeVisible(FUNCTION_WAIT);
  // Mock AI: the first number goes up by one, so the check against the notes flags it.
  await expect(page.getByTestId("result-text")).toContainText("pitches free 8pm, £6 each");
  await expect(page.getByTestId("result").getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(page.getByTestId("checks")).toContainText("These parts of your notes look different in the message.");
  await expect(page.getByTestId("checks")).toContainText("Numbers from your notes");
  await expectNoSeriousA11yIssues(page);

  // Back and forth: each tab still shows its own text and result.
  await draftTab.check();
  await expect(page.getByRole("textbox", { name: "Paste an AI draft" })).toHaveValue(draft);
  await expect(page.getByTestId("result-text")).toContainText("£451");
  await expect(page.getByText("pitches free 8pm")).toHaveCount(0);
  await createTab.check();
  await expect(page.getByRole("textbox", { name: "Create in your voice" })).toHaveValue(/cant make football/);
  await expect(page.getByTestId("result-text")).toContainText("pitches free 8pm");
});

test("draft type: suggested from the draft, can be changed, no ? badges, and the result keeps a careful Email's sign-off", async ({ page }) => {
  await withSamples(page);
  const kinds = page.getByTestId("kind");
  await expect(kinds.getByRole("radio")).toHaveCount(4);
  // Work until the draft suggests something else (Cam, 16 Oct).
  await expect(kinds.getByRole("radio", { name: "Work" })).toBeChecked();
  await page.getByLabel("Paste an AI draft").fill("Hi Jo,\n\nthe report is attached and its about 450 words. i hope it helps.\n\nKind regards,\nCam");
  await expect(kinds.getByRole("radio", { name: "Email" })).toBeChecked();
  await expect(page.getByText("Suggested: Email. Pick another if that's wrong.")).toBeVisible();

  // The explainers moved to How it works on the front page (Cam, 16 Oct).
  await expect(page.getByRole("button", { name: /What is .* for\?/ })).toHaveCount(0);
  await expectNoSeriousA11yIssues(page);

  await kinds.getByRole("radio", { name: "Text" }).check();
  await expect(kinds.getByRole("radio", { name: "Text" })).toBeChecked();
  await kinds.getByRole("radio", { name: "Email" }).check();
  await page.getByTestId("rewrite").click();
  const result = page.getByTestId("result-text");
  await expect(result).toContainText("The report is attached and it's about", FUNCTION_WAIT);
  await expect(result).toContainText("I hope it helps.");
  await expect(result).toContainText(/Kind regards,\s+Cam/);
  await expect(page.getByTestId("changes")).toContainText("capitals, apostrophes or abbreviations fixed");
});
