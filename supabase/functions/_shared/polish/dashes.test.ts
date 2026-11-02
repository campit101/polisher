import { describe, expect, it } from "vitest";
import { fixDashes } from "./dashes.ts";

describe("fixDashes", () => {
  it("turns a spaced em dash into a comma", () => {
    expect(fixDashes("The plan is simple — use less.")).toEqual({ text: "The plan is simple, use less.", count: 1 });
  });

  it("turns an unspaced em dash into a comma", () => {
    expect(fixDashes("The plan is simple—use less.").text).toBe("The plan is simple, use less.");
  });

  it("turns a pair of dashes around an aside into commas", () => {
    expect(fixDashes("Our tool — built in Aberdeen — is fast.")).toEqual({
      text: "Our tool, built in Aberdeen, is fast.",
      count: 2,
    });
  });

  it("handles en dashes and the horizontal bar used as dashes", () => {
    expect(fixDashes("Fast – and cheap.").text).toBe("Fast, and cheap.");
    expect(fixDashes("Fast ― and cheap.").text).toBe("Fast, and cheap.");
  });

  it("turns a spaced double hyphen into a comma but leaves command flags alone", () => {
    expect(fixDashes("It works -- mostly.").text).toBe("It works, mostly.");
    expect(fixDashes("Run it with --force first.").text).toBe("Run it with --force first.");
  });

  it("turns dashes in number ranges into the word to", () => {
    expect(fixDashes("Open 9–5, pages 10—12 and 2020 – 2024.")).toEqual({
      text: "Open 9 to 5, pages 10 to 12 and 2020 to 2024.",
      count: 3,
    });
  });

  it("treats prices, percentages and times as ranges", () => {
    expect(fixDashes("£5–£10, 5%–10% and 9am – 5pm.").text).toBe("£5 to £10, 5% to 10% and 9am to 5pm.");
  });

  it("turns dash bullets into hyphen bullets", () => {
    expect(fixDashes("— first\n  – second")).toEqual({ text: "- first\n  - second", count: 2 });
  });

  it("drops a dash that follows punctuation", () => {
    expect(fixDashes("It works. — Next step.").text).toBe("It works. Next step.");
  });

  it("drops a dash before closing punctuation or at the end of a line", () => {
    expect(fixDashes("Wait —.").text).toBe("Wait.");
    expect(fixDashes("And so on —\nNext").text).toBe("And so on\nNext");
    expect(fixDashes("And so on—").text).toBe("And so on");
  });

  it("leaves hyphens and dash-free text alone", () => {
    expect(fixDashes("A well-known, up-to-date tool.")).toEqual({ text: "A well-known, up-to-date tool.", count: 0 });
    expect(fixDashes("")).toEqual({ text: "", count: 0 });
  });

  it("never leaves an em dash, en dash or horizontal bar behind", () => {
    const messy = "— a—b – c ― d —, e 1–2 —\n—\n x —— y";
    expect(fixDashes(messy).text).not.toMatch(/[—–―]/);
  });
});
