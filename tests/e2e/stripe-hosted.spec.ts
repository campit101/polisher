// The real Stripe-hosted Checkout page in test mode, paid with Stripe's published test card.
// Guest checkout is gone in the demo (a visitor must start a demo account first), so only the signed-in payment is tested here.
// Runs only when asked: E2E_STRIPE_HOSTED=1 npx playwright test --grep @stripe-hosted
// Stripe cannot reach a local server, so the test fetches the real events Stripe created and
// delivers them, signed, to the local webhook: the payloads are Stripe's own, not made up.
// Uses the plain Playwright test: Stripe's page logs its own console messages.
import { expect, test } from "@playwright/test";
import Stripe from "stripe";
import { admin } from "../integration/supabase-test-project";
import { newEmail, signIn } from "./sign-in";

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) throw new Error("This test needs a Stripe test-mode key.");
const stripe = new Stripe(key);

test("@stripe-hosted a signed-in person pays and lands on the Write page as a subscriber", async ({ page }) => {
  test.setTimeout(180_000);
  await admin.from("rate_limits").delete().like("key", "checkout:%");
  const userIds: string[] = [];
  const user = await signIn(page, userIds, newEmail("hosted"));
  await page.getByTestId("subscribe").click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  const cardNumber = page.locator("#cardNumber");
  if (!(await cardNumber.isVisible())) await page.getByTestId("card-accordion-item-button").dispatchEvent("click");
  await cardNumber.fill("4242424242424242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("Test Person");
  const postcode = page.locator("#billingPostalCode");
  if (await postcode.isVisible()) await postcode.fill("AB10 1AA");
  await page.locator("#termsOfServiceConsentCheckbox").check();
  await page.getByTestId("hosted-payment-submit-button").click();

  await page.waitForURL(/\/app/, { timeout: 60_000 });
  await expect(page.getByTestId("subscribed-notice")).toBeVisible();
  await page.goto("/account");
  await expect(page.getByTestId("plan")).toHaveText("Pro");
  await expect(page.getByTestId("usage-today")).toHaveText("100% left, 60/60 credits");
  await page.goto("/");
  await expect(page.locator("#price").getByTestId("subscribed")).toBeVisible();

  const { data } = await admin.from("subscriptions").select("stripe_subscription_id, stripe_customer_id").eq("user_id", user.id);
  for (const row of data ?? []) {
    await admin.from("subscriptions").delete().eq("stripe_subscription_id", row.stripe_subscription_id);
    await stripe.customers.del(row.stripe_customer_id).catch(() => undefined);
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
});
