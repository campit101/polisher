// Takes the README and case-study screenshots from a running copy of the demo, on desktop and phone
// sizes, into docs/screenshots. Starts a throwaway demo account to show the signed-in pages; it is
// deleted automatically after 24 hours. Calls no AI: the Write page is shown before any rewrite.
// Usage: node scripts/screenshots.ts <base url>   (for example https://polisher-demo.vercel.app)
import { mkdirSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) throw new Error("Usage: node scripts/screenshots.ts <base url>");
const out = "docs/screenshots";
mkdirSync(out, { recursive: true });

const sizes = [
  { name: "desktop", options: { viewport: { width: 1440, height: 900 } } },
  { name: "phone", options: { ...devices["Pixel 7"] } },
] as const;

const browser = await chromium.launch();
try {
  for (const size of sizes) {
    const context = await browser.newContext({ ...size.options, colorScheme: "dark" });
    const page = await context.newPage();
    const shot = async (name: string, fullPage = false) => {
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: `${out}/${name}-${size.name}.png`, fullPage });
      console.log(`${out}/${name}-${size.name}.png`);
    };
    await page.goto(`${base}/`);
    await shot("home");
    await shot("home-full", true);
    await page.goto(`${base}/sign-in?next=/app`);
    await shot("sign-in");
    await page.getByTestId("start-demo").click();
    // "?next=/app" on the sign-in page also ends in /app, so wait for the Write page itself.
    await page.waitForURL((url) => url.pathname === "/app", { timeout: 30_000 });
    await page.getByRole("heading", { level: 1, name: "Write" }).waitFor();
    // A new account opens the samples pop-up; the screenshot shows the tool behind it.
    await page.keyboard.press("Escape");
    await shot("write");
    await page.goto(`${base}/account`);
    await page.waitForURL((url) => url.pathname === "/account");
    await shot("account");
    await context.close();
  }
} finally {
  await browser.close();
}
