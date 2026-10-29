import { describe, expect, it } from "vitest";
import { trigramSurvival } from "../../scripts/eval/changed";

describe("trigramSurvival (how much of the draft's wording is left in the rewrite)", () => {
  it("is 1 when the rewrite is the draft", () => {
    const draft = "I wanted to let you know that the meeting has moved to Friday.";
    expect(trigramSurvival(draft, draft)).toBe(1);
  });

  it("is 0 when no three-word run survives", () => {
    expect(trigramSurvival("the meeting has moved to Friday", "Friday works now, see you then")).toBe(0);
  });

  it("counts the share of the draft's distinct three-word runs found in the rewrite", () => {
    // Draft runs: a b c, b c d, c d e, d e f. The rewrite keeps a b c and b c d only.
    expect(trigramSurvival("a b c d e f", "a b c d x y")).toBe(0.5);
  });

  it("ignores case, punctuation and curly apostrophes", () => {
    expect(trigramSurvival("Don't move the Friday meeting.", "don’t move the friday meeting")).toBe(1);
  });

  it("is 0 for a draft too short to have a three-word run", () => {
    expect(trigramSurvival("hi there", "hi there")).toBe(0);
  });
});
