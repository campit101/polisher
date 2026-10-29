import { describe, expect, it } from "vitest";
import { site } from "@/config/site";
import { PAID_STATUSES } from "@/lib/billing";
import { limits, paidStatuses } from "../../supabase/functions/_shared/rewrite/limits.ts";

describe("Edge Function limits", () => {
  it("match the limits the site copy promises", () => {
    expect(limits.draftMaxWords).toBe(site.draftMaxWords);
    expect(limits.draftMaxChars).toBe(site.draftMaxChars);
    expect(limits.samplesMin).toBe(site.samples.min);
    expect(limits.taste.minWords).toBe(site.tasteMinWords);
    expect(limits.sampleMaxWords).toBe(site.samples.maxWordsEach);
    expect(limits.sampleMaxChars).toBe(site.samples.maxCharsEach);
    expect(limits.samplesMinTotalWords).toBe(site.samples.minTotalWords);
  });

  it("stop drafts at 1,000 words and 10,000 characters (Cam, 16 Oct)", () => {
    expect(limits.draftMaxWords).toBe(1000);
    expect(limits.draftMaxChars).toBe(10000);
  });

  it("ask signed-in accounts for no more writing than the free try needs (Cam, 16 Oct)", () => {
    expect(limits.samplesMinTotalWords).toBe(limits.taste.minWords);
    expect(limits.samplesMin).toBe(limits.taste.minAnswers);
  });

  it("give the paid allowance to the same subscription statuses as the site", () => {
    expect([...paidStatuses]).toEqual([...PAID_STATUSES]);
  });
});
