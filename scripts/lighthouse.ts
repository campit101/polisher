// Lighthouse check (T10, CONSTRAINTS.md gate 4): mobile scores for performance, accessibility, best
// practices and SEO on public pages of a running production build. The landing page must score 90 or
// more in all four, judged on the median of 5 runs (Lighthouse's variability guide: the median of 5
// runs is about twice as stable as one); the other pages get one run each and are reported only.
// Playwright starts Chromium with a debugging port and Lighthouse attaches to it (Lighthouse's own
// Chrome launcher cannot start Chrome on this laptop). Reports go to the git-ignored .lighthouse folder.
// Usage: build and start the site first, then: npm run lighthouse -- [base address, default http://localhost:3200]
// SEO is low by design while LAUNCHED is false (noindex), so judge SEO on a local build made with
// LAUNCHED=true; the script says which it saw.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";

const base = process.argv[2] ?? "http://localhost:3200";
const PAGES = ["/", "/privacy", "/terms", "/refunds", "/sign-in"];
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;
const GATE = 90;
const LANDING_RUNS = 5;
const PORT = 9333;

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

mkdirSync(".lighthouse", { recursive: true });
const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
let failed = false;
try {
  for (const path of PAGES) {
    const gated = path === "/";
    const name = gated ? "landing" : path.slice(1).replace(/\W+/g, "-");
    const runs: number[][] = [];
    let noindex = false;
    let last = "";
    for (let run = 1; run <= (gated ? LANDING_RUNS : 1); run++) {
      const result = await lighthouse(new URL(path, base).href, { port: PORT, output: ["json", "html"], logLevel: "error" });
      if (!result) throw new Error(`Lighthouse returned nothing for ${path}`);
      const [json, html] = result.report as string[];
      writeFileSync(`.lighthouse/${name}-${run}.json`, json!);
      writeFileSync(`.lighthouse/${name}-${run}.html`, html!);
      runs.push(CATEGORIES.map((c) => Math.round((result.lhr.categories[c]?.score ?? 0) * 100)));
      noindex = result.lhr.audits["is-crawlable"]?.score === 0;
      const a = result.lhr.audits;
      last = `LCP ${a["largest-contentful-paint"]?.displayValue}, TBT ${a["total-blocking-time"]?.displayValue}, CLS ${a["cumulative-layout-shift"]?.displayValue}`;
    }
    const scores = CATEGORIES.map((_, i) => median(runs.map((r) => r[i]!)));
    const below = gated ? CATEGORIES.filter((c, i) => scores[i]! < GATE && !(c === "seo" && noindex)) : [];
    if (below.length) failed = true;
    const spread = gated ? `  performance runs ${runs.map((r) => r[0]).join(", ")}` : `  (${last})`;
    process.stdout.write(
      `${path.padEnd(10)} ${gated ? `median of ${LANDING_RUNS}: ` : ""}${CATEGORIES.map((c, i) => `${c} ${scores[i]}`).join("  ")}${spread}` +
        `${noindex ? "  [noindex: LAUNCHED is false, SEO not judged]" : ""}${below.length ? `  BELOW ${GATE}: ${below.join(", ")}` : ""}\n`,
    );
  }
} finally {
  await browser.close();
}
process.stdout.write(failed ? `Landing page is below ${GATE} in at least one category.\n` : `Landing page meets the ${GATE} gate.\n`);
process.exit(failed ? 1 : 0);
