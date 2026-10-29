// Violet haze: the moving background behind the front page's hero (Cam, 17 Oct).
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const haze = (page: Page) => page.locator(".polisher-violet-haze");
const layers = (page: Page) => page.locator(".polisher-violet-haze > span");

test("the haze moves behind the hero only, under the navigation, and never takes a click", async ({ page }) => {
  await page.goto("/");
  await expect(haze(page)).toHaveCount(1);
  await expect(haze(page)).toHaveAttribute("aria-hidden", "true");
  await expect(layers(page)).toHaveCount(3);
  // Inside the hero's host, which does not contain the site header.
  const host = page.locator(".polisher-violet-haze-host");
  await expect(host.locator("#hero-heading")).toHaveCount(1);
  await expect(host.locator("header")).toHaveCount(0);

  const style = await haze(page).evaluate((el) => {
    const s = getComputedStyle(el);
    return { pointer: s.pointerEvents, position: s.position, z: s.zIndex };
  });
  expect(style).toEqual({ pointer: "none", position: "absolute", z: "-1" });
  for (const name of await layers(page).evaluateAll((spans) => spans.map((s) => getComputedStyle(s).animationName))) {
    expect(name).toMatch(/^polisher-violet-drift-[abc]$/);
  }

  // The tool sits on top: the middle of the draft box is the draft box, not the haze.
  const box = page.getByRole("textbox", { name: /draft/i }).first();
  await box.scrollIntoViewIfNeeded();
  const rect = (await box.boundingBox())!;
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  expect(hit).toBe("TEXTAREA");

  // No sideways scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("the haze dims while the draft box has focus, and pauses while the tab is hidden", async ({ page }) => {
  await page.goto("/");
  const opacity = () => haze(page).evaluate((el) => Number(getComputedStyle(el).opacity));
  await expect.poll(opacity).toBeCloseTo(0.72, 2);
  await page.getByRole("textbox", { name: /draft/i }).first().focus();
  await expect.poll(opacity, { timeout: 4_000 }).toBeCloseTo(0.288, 2);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(haze(page)).toHaveAttribute("data-paused", "true");
  for (const state of await layers(page).evaluateAll((spans) => spans.map((s) => getComputedStyle(s).animationPlayState))) {
    expect(state).toBe("paused");
  }
});

test("the haze stands still with reduced motion, from the device or from Settings", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(layers(page)).toHaveCount(3);
  for (const name of await layers(page).evaluateAll((spans) => spans.map((s) => getComputedStyle(s).animationName))) {
    expect(name).toBe("none");
  }

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => localStorage.setItem("polisher-motion", "reduced"));
  await page.reload();
  for (const name of await layers(page).evaluateAll((spans) => spans.map((s) => getComputedStyle(s).animationName))) {
    expect(name).toBe("none");
  }
});

test("the light theme has no haze", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("polisher-theme", "light"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(haze(page)).toHaveCount(1);
  await expect(haze(page)).toBeHidden();
});

test("hero text keeps at least 4.5:1 contrast against the brightest point of the haze, all through its movement", async ({ page }) => {
  await page.goto("/");
  const texts = ["#hero-heading", '[data-testid="hero-intro"]'];
  const colours = await Promise.all(texts.map((sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).color)));
  // Hide the words so only what is behind them is measured, and stop the clock on the haze.
  await page.addStyleTag({ content: "#hero-heading, #hero-heading ~ p { color: transparent !important; }" });
  const animations = await page.evaluate(() => document.getAnimations().filter((a) => (a as CSSAnimation).animationName?.startsWith("polisher-violet")).length);
  expect(animations).toBe(3);

  const worstBy = new Map<string, number>();
  for (let t = 0; t <= 42_000; t += Number(process.env.HAZE_STEP_MS ?? 3_000)) {
    await page.evaluate((time) => {
      for (const a of document.getAnimations()) if ((a as CSSAnimation).animationName?.startsWith("polisher-violet")) {
        a.pause();
        a.currentTime = time;
      }
    }, t);
    for (const [i, sel] of texts.entries()) {
      const shot = (await page.locator(sel).first().screenshot({ animations: "allow" })).toString("base64");
      const contrast = await page.evaluate(
        async ([png, colour]) => {
          // An image, not fetch: the page's own security policy only lets it fetch from itself.
          const image = new Image();
          image.src = `data:image/png;base64,${png}`;
          await image.decode();
          const bitmap = await createImageBitmap(image);
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(bitmap, 0, 0);
          const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
          const lum = (r: number, g: number, b: number) => {
            const f = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
          };
          let brightest = 0;
          for (let p = 0; p < data.length; p += 4) brightest = Math.max(brightest, lum(data[p]!, data[p + 1]!, data[p + 2]!));
          const [r = 0, g = 0, b = 0] = colour.match(/\d+(\.\d+)?/g)!.map(Number);
          const text = lum(r, g, b);
          return (Math.max(text, brightest) + 0.05) / (Math.min(text, brightest) + 0.05);
        },
        [shot, colours[i] ?? ""] as const,
      );
      worstBy.set(sel, Math.min(worstBy.get(sel) ?? Infinity, contrast));
    }
  }
  const report = [...worstBy].map(([sel, value]) => `${sel} ${value.toFixed(2)}`).join(", ");
  test.info().annotations.push({ type: "worst hero text contrast", description: report });
  expect(Math.min(...worstBy.values()), report).toBeGreaterThanOrEqual(4.5);
});
