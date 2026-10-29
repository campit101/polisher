import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";

const theme = (page: import("@playwright/test").Page) => page.locator("html").getAttribute("data-theme");

test("site is dark by default and the Settings dialog switches and remembers the theme", async ({ page }) => {
  await page.goto("/");
  expect(await theme(page)).toBe("dark");

  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await dialog.getByRole("radio", { name: "Light" }).check();
  expect(await theme(page)).toBe("light");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.reload();
  expect(await theme(page)).toBe("light");
  await expectNoSeriousA11yIssues(page);
});

test("Match your device follows the device setting", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "light" });
  const page = await context.newPage();
  await page.goto("/");
  expect(await theme(page)).toBe("dark");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "Match your device" }).check();
  expect(await theme(page)).toBe("light");
  await context.close();
});

test("Reduced motion can be switched on from Settings", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "Reduced" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
});

test("Count my visits can be switched off in Settings, and Global Privacy Control switches it off too (T11)", async ({ browser, page }) => {
  const beacons = (p: import("@playwright/test").Page) => {
    const sent: string[] = [];
    p.on("request", (request) => {
      if (request.url().endsWith("/api/event")) sent.push(request.url());
    });
    return sent;
  };

  const sent = beacons(page);
  await page.goto("/");
  await expect.poll(() => sent.length).toBe(1);

  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog.getByRole("radio", { name: "On" })).toBeChecked();
  await dialog.getByRole("radio", { name: "Off" }).check();
  await expectNoSeriousA11yIssues(page);
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForTimeout(1000);
  expect(sent).toHaveLength(1);

  const context = await browser.newContext();
  await context.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { value: true }));
  const gpc = await context.newPage();
  const gpcSent = beacons(gpc);
  await gpc.goto("/");
  await gpc.waitForTimeout(1000);
  expect(gpcSent).toHaveLength(0);
  await gpc.getByRole("button", { name: "Settings" }).click();
  await expect(gpc.getByRole("radio", { name: "Off" })).toBeChecked();
  await context.close();
});
