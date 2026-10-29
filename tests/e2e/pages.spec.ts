// Demo (29 Oct): the check() helper below also asserts the demo banner on every page it visits.
// Every page, in both themes, with no serious or critical axe issue and a clean console (T10,
// CONSTRAINTS.md gates 3 and 5). Other specs check pages in the middle of their flows; this one makes
// sure no page or theme is missed. Mock AI only, nothing paid.
import type { Page } from "@playwright/test";
import { THEME_KEY } from "../../src/lib/theme";
import { admin } from "../integration/supabase-test-project";
import { E2E_ADMIN_EMAIL } from "./admin-email";
import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";
import { signIn } from "./sign-in";

const userIds: string[] = [];
const THEMES = ["dark", "light"] as const;
const FUNCTION_WAIT = { timeout: 30_000 };

async function removeAdminUser() {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const user of data.users.filter((u) => u.email === E2E_ADMIN_EMAIL)) await admin.auth.admin.deleteUser(user.id);
}

test.afterAll(async () => {
  await admin.from("usage_events").delete().in("user_id", userIds);
  for (const id of userIds.splice(0)) await admin.auth.admin.deleteUser(id);
  await removeAdminUser();
  await admin.from("rate_limits").delete().like("key", "rewrite-ip:%");
});

/** Stores the theme the way the Settings dialog does, before any page script runs. */
async function useTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [THEME_KEY, theme] as const);
}

async function check(page: Page, path: string, theme: string, status = 200) {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(status);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("h1").first()).toBeVisible();
  // The demo banner is on every page (signed in or out, and on the not-found page).
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toHaveText("Demo: test payments only. Nothing is sold.");
  await expect(page.getByTestId("demo-banner")).toHaveCount(1);
  await expectNoSeriousA11yIssues(page);
}

for (const theme of THEMES) {
  test(`signed-out pages pass axe in the ${theme} theme`, async ({ page }) => {
    await useTheme(page, theme);
    for (const path of ["/", "/privacy", "/terms", "/refunds", "/sign-in", "/sign-in?error=link", "/account-deleted", "/subscribed"]) {
      await check(page, path, theme);
    }
  });

  test.describe(() => {
    test.use({ expectedNotFound: ["/no-such-page"] });
    test(`the not-found page passes axe in the ${theme} theme`, async ({ page }) => {
      await useTheme(page, theme);
      await check(page, "/no-such-page", theme, 404);
    });
  });

  test(`signed-in pages, a rewrite result and the admin pages pass axe in the ${theme} theme`, async ({ page }) => {
    await useTheme(page, theme);
    const user = await signIn(page, userIds);
    await check(page, "/account", theme);
    await check(page, "/app", theme);
    // Every sample slot filled, so the once-a-visit samples nudge stays shut.
    await admin.from("writing_samples").insert([1, 2, 3, 4, 5].map((n) => ({ user_id: user.id, body: `Sample ${n}. ` + Array(110).fill("word").join(" ") })));
    await check(page, "/app", theme);
    await page.getByRole("textbox", { name: "Paste an AI draft" }).fill('Hi Jo, the room costs £40 and "we will leverage it" as agreed.');
    await page.getByTestId("rewrite").click();
    await expect(page.getByTestId("result-text")).toBeVisible(FUNCTION_WAIT);
    await expectNoSeriousA11yIssues(page);
    await check(page, "/subscribed", theme);

    await page.context().clearCookies();
    await removeAdminUser();
    await signIn(page, userIds, E2E_ADMIN_EMAIL);
    await check(page, "/admin", theme);
    await check(page, "/admin/blind?set=e2e-pages-empty", theme);
  });
}
