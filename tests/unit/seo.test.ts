// Search engines: the sitemap lists only the public pages, and robots.txt points to it once launched.
import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

afterEach(() => vi.unstubAllEnvs());

describe("sitemap.xml", () => {
  it("lists only the public pages, on the site's own address", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://polisher.example/");
    expect(sitemap().map((entry) => entry.url)).toEqual([
      "https://polisher.example",
      "https://polisher.example/privacy",
      "https://polisher.example/terms",
      "https://polisher.example/refunds",
    ]);
  });
});

describe("robots.txt", () => {
  it("once launched, keeps the private areas out and names the sitemap", () => {
    vi.stubEnv("LAUNCHED", "true");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://polisher.example");
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api/"] },
      sitemap: "https://polisher.example/sitemap.xml",
    });
  });

  it("before launch, still asks every search engine to stay away", () => {
    vi.stubEnv("LAUNCHED", "false");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
