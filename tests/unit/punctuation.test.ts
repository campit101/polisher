import { describe, expect, it } from "vitest";
import { punctuationGaps } from "../../scripts/eval/punctuation.ts";

describe("punctuationGaps", () => {
  it("is zero for a punctuated message with a sign-off", () => {
    expect(punctuationGaps("Hi Jamie,\n\nI can't make Thursday. Saturday at 7pm instead?\n\nCheers\nCam")).toBe(0);
  });

  it("counts small-letter sentence starts, a lone small i and lines with no end punctuation, per 100 words", () => {
    // 10 words; gaps: "can't" start, "i", "saturday" start, missing end on the last line = 4.
    expect(punctuationGaps("can't make it, i'm working. saturday at 7 instead maybe")).toBeCloseTo(40);
  });

  it("skips links and bullet markers", () => {
    expect(punctuationGaps("Details here:\nhttps://example.com/a\n- Bring boots.")).toBe(0);
  });
});
