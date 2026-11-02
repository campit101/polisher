import type { MetadataRoute } from "next";
import { siteUrlFrom } from "@/config/site";

// Only the public pages. Sign-in, the Write page and the account pages are not worth a search result.
const PUBLIC_PATHS = ["/", "/privacy", "/terms", "/refunds"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrlFrom(process.env);
  // The home page without a trailing slash, matching its canonical tag.
  return PUBLIC_PATHS.map((path) => ({ url: path === "/" ? base : `${base}${path}` }));
}
