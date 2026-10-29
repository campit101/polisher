import { describe, expect, it } from "vitest";
import { rewriteRequest } from "../rewrite/prompts.ts";
import { forModel } from "./models.ts";
import { baselineRequest, parseBaseline } from "./baseline.ts";

describe("baselineRequest", () => {
  const request = baselineRequest(["first sample", "second sample"], "the draft");

  it("keeps the model and settings of Polisher's rewrite call when the T9 pairs were made (Haiku 5.5)", () => {
    const polisher = forModel(rewriteRequest("a profile", "the draft"), "haiku");
    expect(request.model).toBe(polisher.model);
    expect(request.thinking).toEqual(polisher.thinking);
    expect(request.output_config.effort).toBe(polisher.output_config.effort);
    expect(request.max_tokens).toBe(polisher.max_tokens);
  });

  it("is one plain message with every sample and the draft, and no system rules", () => {
    expect(request).not.toHaveProperty("system");
    expect(request.messages).toHaveLength(1);
    const text = request.messages[0].content;
    expect(text).toContain("<sample>\nfirst sample\n</sample>");
    expect(text).toContain("<sample>\nsecond sample\n</sample>");
    expect(text).toContain("<draft>\nthe draft\n</draft>");
    expect(text).toContain("Rewrite the draft below so it sounds like me.");
  });
});

describe("parseBaseline", () => {
  const usage = { input_tokens: 1, output_tokens: 1 };

  it("returns the text, trimmed", () => {
    expect(parseBaseline({ content: [{ type: "text", text: "  Hello there \n" }], stop_reason: "end_turn", usage })).toEqual({ ok: true, text: "Hello there" });
  });

  it("refuses a cut-off or empty answer", () => {
    expect(parseBaseline({ content: [{ type: "text", text: "Half" }], stop_reason: "max_tokens", usage })).toEqual({ ok: false, reason: "cut_off" });
    expect(parseBaseline({ content: [], stop_reason: "end_turn", usage })).toEqual({ ok: false, reason: "empty" });
  });
});
