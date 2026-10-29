import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { isLaunched, site, siteUrlFrom } from "@/config/site";
import { landing } from "@/content/landing";
import { themeBootScript } from "@/lib/theme";
import { VisitAnalytics } from "./components/visit-analytics";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
// The serif is only used in the demo window below the fold, so it is not preloaded: on a slow phone the
// preload competed with the hero text and cost the landing page its Lighthouse performance score (T10).
const serif = Source_Serif_4({ variable: "--font-serif4", subsets: ["latin"], display: "swap", preload: false });

export const metadata: Metadata = {
  // Canonical and share-image addresses are built on the site's own address.
  metadataBase: new URL(siteUrlFrom(process.env)),
  title: { default: landing.title, template: `%s | ${site.name}` },
  description: landing.description,
  // While LAUNCHED is not "true", every page asks search engines to stay away.
  robots: isLaunched() ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#121214" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set before paint by the script below; React must not fight it.
    // data-scroll-behavior: Next.js 16 only turns smooth scrolling off during navigation when asked, and
    // without it new pages opened part-way down (Cam, 16 Oct).
    <html lang="en-GB" data-theme="dark" data-scroll-behavior="smooth" className={`${inter.variable} ${serif.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <p data-testid="demo-banner" className="bg-accent px-5 py-2 text-center text-sm font-medium text-accent-ink">
          {site.demo.banner}
        </p>
        {children}
        {/* Cookieless page counts, only on Vercel (locally the script would 404); visitors can switch them off. */}
        {process.env.VERCEL === "1" ? <VisitAnalytics /> : null}
      </body>
    </html>
  );
}
