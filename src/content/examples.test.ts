import { describe, expect, it } from "vitest";
import { findTells } from "@polish/index.ts";
import drafts from "../../tests/fixtures/eval/q1/drafts.json";
import { readyMadeExamples } from "./examples";

describe("ready-made examples (shown when the daily AI budget is used up)", () => {
  it("has three, each a made-up draft from the fixed evaluation set, copied word for word", () => {
    expect(readyMadeExamples).toHaveLength(3);
    for (const example of readyMadeExamples) {
      expect(example.draft).toBe((drafts as { id: string; text: string }[]).find((d) => d.id === example.id)?.text);
    }
  });

  it("shows rewrites with no AI tells and no long dashes, the things Polisher removes", () => {
    for (const { rewrite } of readyMadeExamples) {
      expect(findTells(rewrite)).toEqual([]);
      expect(rewrite).not.toMatch(/[–—]/);
    }
  });
});
