// The site must pass its own rules: no long dashes, no stock phrases, British spelling.
import { describe, expect, it } from "vitest";
import { findTells, polish } from "@polish/index.ts";
import { landing, specimen } from "@/content/landing";
import { legalDocs } from "@/content/legal";
import { ui } from "@/content/ui";
import { authCopy } from "@/content/auth";
import { billingCopy } from "@/content/billing";
import { appCopy } from "@/content/app";
import { adminCopy } from "@/content/admin";

/** Every string inside a value, with its path, skipping keys that show AI habits on purpose. */
function strings(value: unknown, path: string, skip: ReadonlySet<string>): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${path}[${i}]`, skip));
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !skip.has(key))
      .flatMap(([key, item]) => strings(item, `${path}.${key}`, skip));
  }
  return [];
}

const copy = [
  ...strings(landing, "landing", new Set(["example"])),
  ...strings(ui, "ui", new Set()),
  ...strings(authCopy, "auth", new Set()),
  ...strings(billingCopy, "billing", new Set()),
  ["billing.checkout.terms()", billingCopy.checkout.terms("https://polisher.example")] as [string, string],
  ["billing.checkout.submit()", billingCopy.checkout.submit("https://polisher.example")] as [string, string],
  ...billingCopy.confirmation
    .paragraphs("https://polisher.example", "18 October 2026")
    .map((text, i) => [`billing.confirmation.paragraphs()[${i}]`, text] as [string, string]),
  ["billing.confirmation.charged(date)", billingCopy.confirmation.charged("18 November 2026")] as [string, string],
  ["billing.confirmation.charged(null)", billingCopy.confirmation.charged(null)] as [string, string],
  ...Object.entries(authCopy.account)
    .filter(([, value]) => typeof value === "function")
    .map(([key, fn]) => [`auth.account.${key}()`, (fn as (x: string) => string)("13 October 2026")] as [string, string]),
  ...legalDocs.flatMap((doc) => strings(doc, doc.slug, new Set())),
  ...strings(appCopy, "app", new Set(["example"])),
  ...strings(adminCopy, "admin", new Set()),
  ...[
    adminCopy.status.running("2026-10-30T09:00:00Z", 1),
    adminCopy.status.running("2026-10-30T09:00:00Z", 239),
    adminCopy.status.finished("2026-10-30T09:00:00Z"),
    adminCopy.target(37, 100),
    adminCopy.leftOut([[1, "admin address", "admin addresses"], [3, "refund", "refunds"], [0, "test payment", "test payments"]]),
    adminCopy.leftOut([]),
    adminCopy.aiSpend(0.1234, 1),
    adminCopy.aiMode("live"),
    adminCopy.aiMode("mock"),
    adminCopy.blind.progress(7, 20),
    adminCopy.blind.pair(8, 20),
    adminCopy.blind.wins(14, 20),
    adminCopy.blind.wins(1, 20),
    adminCopy.blind.models.wins(14, 6, 20),
  ].map((text, i) => [`admin functions [${i}]`, text] as [string, string]),
  ...[
    appCopy.samples.progress(1, 1),
    appCopy.samples.progress(3, 450),
    appCopy.samples.needMore(1, 120),
    appCopy.samples.needMore(0, 5),
    appCopy.samples.sampleLabel(2),
    appCopy.samples.words(12),
    appCopy.draft.count(1000),
    appCopy.result.free(1, 2),
    appCopy.limits.monthly("2026-11-01T09:00:00Z", 0, 50),
    appCopy.limits.monthly(null, 450, 600),
    appCopy.limits.daily(0, 50),
    appCopy.limits.daily(400, 401),
    appCopy.usage.percentLeft(97),
    appCopy.usage.creditsLine(291, 300),
    appCopy.usage.meterPaid(97),
    appCopy.draft.credits(1),
    appCopy.draft.credits(100),
    appCopy.draft.credits(123),
    appCopy.draft.count(12, 300),
    appCopy.usage.meterFree(1, 2),
    appCopy.usage.freeLeft(1, 2),
    appCopy.samples.ready(0),
    appCopy.samples.ready(1),
    appCopy.samples.ready(2),
    appCopy.draft.needsMore(1, 120),
    appCopy.usage.monthResets("2026-11-01T09:00:00Z"),
    appCopy.usage.monthResets(null),
    appCopy.usage.freeLine(0, 3),
    appCopy.usage.freeLine(1, 3),
    appCopy.usage.freeLine(2, 3),
    appCopy.usage.freeLine(3, 3),
  ].map((text, i) => [`app functions [${i}]`, text] as [string, string]),
];

describe("site copy", () => {
  it("has a lot of copy to check", () => {
    expect(copy.length).toBeGreaterThan(80);
  });

  it.each(copy)("%s passes the polisher rules", (_path, text) => {
    expect(findTells(text)).toEqual([]);
  });

  // Launch decision 7 (Cam, 16 Oct): Polisher cannot remove a provider's statistical watermark, so
  // no copy may say it takes watermarks out. The habits are "AI phrasing and formatting".
  it.each(copy)("%s never mentions watermarks", (_path, text) => {
    expect(text).not.toMatch(/watermark/i);
  });

  it("names AI phrasing and formatting where watermarks used to be", () => {
    expect(landing.hero.intro).toBe(
      "Paste a draft from any AI. Polisher rewrites it in your own voice and strips out the usual AI phrasing and formatting.",
    );
    expect(landing.removes.items[0]?.title).toBe("Common AI phrasing and formatting");
  });

  it("keeps the price card short and explains credits in the questions (Cam, 17 Oct)", () => {
    expect(landing.pricing.points[0]).toBe("300 credits a month, up to 60 a day");
    expect(landing.pricing.points.join(" ")).not.toMatch(/1 credit is|counts at least/);
    const usageAnswer = landing.faq.items.find((item) => item.q === "How much can I use it?")?.a ?? "";
    expect(usageAnswer).toContain("1 credit is 100 words");
    expect(usageAnswer).toContain("each rewrite counts at least 50 words");
  });

  it("says more samples give Polisher more to go on, without promising a result (Cam, 17 Oct)", () => {
    expect(landing.steps.items[0]?.body).toContain("150 words or more in total (the more you add, the more Polisher has to go on)");
  });

  it("keeps the privacy line under the tool to what Polisher itself does (Cam, 17 Oct)", () => {
    expect(appCopy.draft.notStored).toBe("Polisher never saves drafts or rewrites.");
  });

  it("says where History keeps rewrites wherever History exists (pre-launch review, 17 Oct)", () => {
    // The signed-in Write page has History, so its line says the last 5 stay in this browser.
    expect(appCopy.draft.notStoredWithHistory).toBe("Polisher's servers never save drafts or rewrites. Your last 5 rewrites stay in History, in this browser only.");
    const keep = landing.faq.items.find((item) => item.q === "Do you keep my writing?")?.a ?? "";
    expect(keep).toContain("Polisher's servers never save your drafts or rewrites");
    expect(keep).toContain("your last 5 rewrites stay in History, in your own browser");
  });

  it("never implies the checks prove the meaning is unchanged (pre-launch review, 17 Oct)", () => {
    expect(appCopy.result.noChecks).not.toContain("nothing new was added");
    expect(appCopy.result.noChecks).toBe(
      "Numbers, links and quotations from your draft all came through. These checks can't catch every change in meaning, so read it through before you send it.",
    );
    expect(appCopy.result.certainty).toBe("Words like not, may or will that changed:");
  });
});

describe("hero specimen", () => {
  const draft = specimen.map((s) => s.text).join("");

  it("marks exactly what the real post-processor changes", () => {
    const after = polish(draft).text;
    for (const segment of specimen) {
      const survives = after.includes(segment.text);
      expect(survives, `${JSON.stringify(segment.text)} should ${segment.tell ? "be changed" : "survive"}`).toBe(!segment.tell);
    }
  });

  it("comes out clean after the clean-up step", () => {
    expect(findTells(polish(draft).text)).toEqual([]);
  });
});

describe("privacy notice at T12", () => {
  const privacy = legalDocs.find((doc) => doc.slug === "privacy")!;
  const text = strings(privacy, "privacy", new Set()).map(([, value]) => value).join("\n");

  it("no longer describes the waiting list, which the site removed (R1)", () => {
    expect(text).not.toMatch(/waitlist|waiting list/i);
  });

  it("says no emails are ever sent, and that demo accounts go after 24 hours (demo, 29 Oct)", () => {
    expect(text).toContain("No emails are ever sent.");
    expect(text).toContain("deleted automatically after 24 hours");
    expect(text).not.toMatch(/brevo/i);
  });

  it("says the visit counter keeps a daily code, not an address, to count different people (21 Oct)", () => {
    expect(privacy.updated).toBe("29 October 2026");
    expect(text).toContain("To count how many different people visit, our counter also keeps a scrambled code made from your internet address and browser type. The code changes every day and cannot be turned back into your address, so it cannot be linked to you or to your visits on other days.");
    expect(text).not.toContain("without cookies and without identifying you");
  });
});
