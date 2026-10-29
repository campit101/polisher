import { describe, expect, it } from "vitest";
import { findTells, polish } from "./index.ts";

const aiDraft = [
  "Hi Sam,",
  "",
  "I hope this email finds you well.",
  "",
  "In today's fast-paced world, every business needs a website — and yours deserves a modern one. Moreover, we will organize the content and optimize the color scheme in order to boost your center's traffic.",
  "",
  "Feel free to reach out with questions.",
].join("\n");

describe("polish", () => {
  it("fixes dashes, stock phrases and spelling together", () => {
    const { text, report } = polish(aiDraft);
    expect(text).toBe(
      [
        "Hi Sam,",
        "",
        "Every business needs a website, and yours deserves a modern one. Also, we will organise the content and optimise the colour scheme to boost your centre's traffic.",
        "",
        "Get in touch with questions.",
      ].join("\n"),
    );
    expect(report.dashesReplaced).toBe(1);
    expect(report.phrasesChanged.map((p) => p.phrase).sort()).toEqual([
      "feel free to reach out",
      "i hope this email finds you well",
      "in order to",
      "in today's fast-paced world",
      "moreover",
    ]);
    expect(report.spellingsChanged).toHaveLength(4);
  });

  it("is idempotent", () => {
    const once = polish(aiDraft).text;
    expect(polish(once)).toEqual({ text: once, report: polish("").report });
  });

  it("leaves links, email addresses and code untouched", () => {
    const text = "See https://example.com/color—center or mail color@example.com, then run `colorize()`.";
    expect(polish(text).text).toBe(
      "See https://example.com/color—center or mail color@example.com, then run `colorize()`.",
    );
    expect(polish("```\nconst color = 1 — 2;\n```").text).toBe("```\nconst color = 1 — 2;\n```");
  });

  it("leaves text inside double quotation marks alone and says so", () => {
    const text = 'She said "we will leverage the data" — and I agree we should leverage the data. He wrote “the color — center” too.';
    const { text: out, report } = polish(text);
    expect(out).toBe('She said "we will leverage the data", and I agree we should use the data. He wrote “the color — center” too.');
    expect(report.quotationsKept).toBe(2);
    expect(report.dashesReplaced).toBe(1);
    expect(report.spellingsChanged).toEqual([]);
  });

  it("does not let a lone quotation mark swallow the rest of the text", () => {
    expect(polish('A 5" pipe — in the color grey.').text).toBe('A 5" pipe, in the colour grey.');
    expect(polish('He said "stop.\n\nThen the color changed.').text).toBe('He said "stop.\n\nThen the colour changed.');
  });

  it("removes hidden characters and chat citation markers, and reports them", () => {
    const { text, report } = polish("The colo\u200Br plan :contentReference[oaicite:0]{index=0} is ready.");
    expect(text).toBe("The colour plan is ready.");
    expect(report.hiddenRemoved).toBe(1);
    expect(report.markersRemoved).toBe(1);
    expect(findTells("Plain\u200B text.")).toEqual(["1 hidden character removed"]);
  });

  it("handles empty text", () => {
    expect(polish("")).toEqual({
      text: "",
      report: { dashesReplaced: 0, phrasesChanged: [], spellingsChanged: [], quotationsKept: 0, hiddenRemoved: 0, markersRemoved: 0, totalChanges: 0 },
    });
  });
});

describe("findTells", () => {
  it("does not count kept quotations as tells", () => {
    expect(findTells('Plain words. "Quoted words."')).toEqual([]);
  });


  it("finds nothing in clean British text", () => {
    expect(findTells("Plain words in the colour we organised.")).toEqual([]);
  });

  it("lists each kind of tell", () => {
    expect(findTells("Moreover — the color.")).toEqual([
      "1 dash replaced",
      "1 stock phrase removed or reworded",
      "1 word changed to UK spelling",
    ]);
  });
});
