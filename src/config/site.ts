// Product facts used across the site. Change them here, nowhere else.
export const site = {
  name: "Polisher",
  // Polisher is a portfolio demo (29 Oct 2026): nothing is sold and Stripe runs in test mode only.
  // The banner is on every page (app/layout.tsx).
  demo: { banner: "Demo: test payments only. Nothing is sold." },
  tagline: "Your AI drafts, back in your own voice.",
  pricePence: 500,
  priceLabel: "£5 a month",
  currency: "gbp",
  refundDays: 30,
  statutoryCancellationDays: 14,
  samples: { min: 3, max: 5, minTotalWords: 150, maxWordsEach: 2000, maxCharsEach: 20000 },
  draftMaxWords: 1000,
  draftMaxChars: 10000,
  // The free taste without an account (R1): words needed across the question answers.
  tasteMinWords: 150,
  // Demo video slot. Leave null until the files exist, then put them in /public/demo and set
  // { src: "/demo/demo.mp4", poster: "/demo/poster.jpg" }. Null renders nothing (no broken player).
  demoVideo: null as { src: string; poster: string } | null,
  owner: {
    name: "Cameron Pittaway",
    email: "polisher.help@gmail.com",
    // None: the demo sells nothing, so the legal pages give no postal address (29 Oct 2026).
    postalAddress: null as string | null,
    town: "Aberdeen, Scotland",
  },
} as const;

/** True only when the LAUNCHED environment variable is exactly "true". */
export function isLaunched(env: Record<string, string | undefined> = process.env): boolean {
  return env.LAUNCHED === "true";
}

/**
 * The site's own address, for email links, the sitemap and canonical tags: NEXT_PUBLIC_SITE_URL if
 * set, else on production the project's production address (Vercel keeps it current, also after a
 * public address is added), else this deployment.
 */
export function siteUrlFrom(env: Record<string, string | undefined>): string {
  if (env.NEXT_PUBLIC_SITE_URL) return env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  if (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:3000";
}
