import type { NextConfig } from "next";
import { assertTestModeKeys } from "./src/lib/stripe-mode";

// The demo runs Stripe in test mode only: a build with a live key fails here, before anything deploys.
assertTestModeKeys(process.env, { requireSecret: false });

// LAUNCHED=false (the default) keeps every page out of search engines.
const launched = process.env.LAUNCHED === "true";

// No nonces: they would make every page dynamic. The browser only ever talks to this site
// (Supabase and Anthropic are called from the server); forms may hand over to Stripe's test pages.
const isDev = process.env.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // `npm run verify` builds into .next-verify so it never clashes with a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // Short links for bios and videos, where the full tracking link will not fit or cannot be tapped (Cam, 21 Oct).
  async redirects() {
    const bio = (source: string) => `/?utm_source=${source}&utm_medium=video&utm_campaign=bio`;
    return [
      { source: "/tt", destination: bio("tiktok"), permanent: false },
      { source: "/ig", destination: bio("instagram"), permanent: false },
      { source: "/yt", destination: bio("youtube"), permanent: false },
    ];
  },
  async headers() {
    const headers = launched
      ? securityHeaders
      : [...securityHeaders, { key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
