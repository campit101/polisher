import type { MetadataRoute } from "next";
import { isLaunched, siteUrlFrom } from "@/config/site";

// LAUNCHED is read at build time, so switching it on needs a redeploy.
export default function robots(): MetadataRoute.Robots {
  return isLaunched()
    ? {
        rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api/"] },
        sitemap: `${siteUrlFrom(process.env)}/sitemap.xml`,
      }
    : { rules: { userAgent: "*", disallow: "/" } };
}
