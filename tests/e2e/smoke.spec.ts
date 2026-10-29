import { admin } from "../integration/supabase-test-project";
import { expect, expectNoSeriousA11yIssues, test } from "./fixtures";
import { landing } from "../../src/content/landing";

test("home page renders and is kept out of search while not launched", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expectNoSeriousA11yIssues(page);
});

test("every response carries the security headers, including a content security policy", async ({ request }) => {
  for (const path of ["/", "/sign-in", "/privacy", "/api/event"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    const headers = response.headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["strict-transport-security"], path).toContain("max-age=63072000");
    const csp = headers["content-security-policy"] ?? "";
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "connect-src 'self'",
      // Only Stripe's test checkout and portal may receive a form: Google sign-in is gone in the demo.
      "form-action 'self' https://checkout.stripe.com https://billing.stripe.com;",
    ]) {
      expect(csp, `${path}: ${directive}`).toContain(directive);
    }
    expect(csp, path).not.toContain("unsafe-eval");
    expect(csp, path).not.toContain("accounts.google.com");
  }
});

test("a page view stores a daily visitor code and never the address (Cam, 21 Oct)", async ({ request }) => {
  const source = `visitor-${Date.now()}`;
  // The full suite sends far more than 60 page views an hour from this one address, and over that
  // the counter drops views quietly, so clear its counter first (test project only).
  await admin.from("rate_limits").delete().like("key", "event:%");
  const sent = await request.post("/api/event", { data: { name: "landing_view", path: "/", search: `?utm_source=${source}` } });
  expect(sent.status()).toBe(204);
  const { data, error } = await admin.from("events").select("*").eq("utm_source", source);
  expect(error).toBeNull();
  try {
    expect(data).toHaveLength(1);
    expect(data![0].visitor_day).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(data)).not.toMatch(/\d+\.\d+\.\d+\.\d+|::1/);
  } finally {
    await admin.from("events").delete().eq("utm_source", source);
  }
});

test("short links for bios and videos land on the front page with their tracking labels", async ({ request }) => {
  for (const [path, source] of [["/tt", "tiktok"], ["/ig", "instagram"], ["/yt", "youtube"]] as const) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(response.headers()["location"], path).toBe(`/?utm_source=${source}&utm_medium=video&utm_campaign=bio`);
  }
});

test("the browser tab shows the Polisher mark, not the template icon", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('head link[rel="icon"][type="image/svg+xml"]').getAttribute("href");
  expect(href).toMatch(/^\/icon\.svg/);
  const svg = await (await request.get(href!)).text();
  expect(svg).toContain("#6352f5");
  const ico = await request.get("/favicon.ico");
  expect(ico.status()).toBe(200);
  expect(ico.headers()["content-type"]).toContain("image/");
  expect((await request.get("/apple-icon.png")).status()).toBe(200);
});

test("search engines get a sitemap of the public pages only", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("xml");
  const locs = [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  expect(locs).toEqual(["/", "/privacy", "/terms", "/refunds"]);
});

test("the home page has a canonical address and share tags with an image", async ({ page, request }) => {
  await page.goto("/");
  const head = page.locator("head");
  const meta = (attr: string, value: string) => head.locator(`meta[${attr}="${value}"]`).getAttribute("content");
  expect(new URL((await head.locator('link[rel="canonical"]').getAttribute("href"))!).pathname).toBe("/");
  expect(await meta("property", "og:title")).toBe(landing.title);
  expect(await meta("property", "og:description")).toBe(landing.description);
  expect(await meta("property", "og:type")).toBe("website");
  expect(await meta("property", "og:site_name")).toBe("Polisher");
  expect(await meta("name", "twitter:card")).toBe("summary_large_image");
  expect(await meta("name", "twitter:title")).toBe(landing.title);
  expect(await meta("property", "og:image:alt")).toBe(landing.title);
  for (const tag of [["property", "og:image"], ["name", "twitter:image"]] as const) {
    const image = await request.get(new URL((await meta(tag[0], tag[1]))!).pathname);
    expect(image.status(), tag[1]).toBe(200);
    expect(image.headers()["content-type"], tag[1]).toBe("image/png");
  }
  for (const path of ["/privacy", "/terms", "/refunds"]) {
    await page.goto(path);
    expect(new URL((await head.locator('link[rel="canonical"]').getAttribute("href"))!).pathname, path).toBe(path);
  }
});
