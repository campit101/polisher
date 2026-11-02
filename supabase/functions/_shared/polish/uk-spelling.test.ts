import { describe, expect, it } from "vitest";
import { US_TO_UK, toUkSpelling } from "./uk-spelling.ts";

const uk = (text: string) => toUkSpelling(text).text;

describe("US_TO_UK list", () => {
  it("has at least 300 pairs", () => {
    expect(US_TO_UK.size).toBeGreaterThanOrEqual(300);
  });

  it("has lower-case keys that differ from their values", () => {
    for (const [us, gb] of US_TO_UK) {
      expect(us).toBe(us.toLowerCase());
      expect(gb).not.toBe(us);
    }
  });
});

describe("toUkSpelling", () => {
  it("swaps listed words", () => {
    expect(uk("The color of the center of the theater.")).toBe("The colour of the centre of the theatre.");
    expect(uk("We traveled far to fulfill a plan on aluminum.")).toBe("We travelled far to fulfil a plan on aluminium.");
    expect(uk("Our defense catalog is gray.")).toBe("Our defence catalogue is grey.");
  });

  it("keeps the case pattern of each word", () => {
    expect(uk("Color is fine. COLOR is loud.")).toBe("Colour is fine. COLOUR is loud.");
  });

  it("applies the -ize and -yze rule", () => {
    expect(uk("organize, organization, realized, optimizing, analyze, paralyzed")).toBe(
      "organise, organisation, realised, optimising, analyse, paralysed",
    );
  });

  it("leaves -ize exceptions and lookalikes alone", () => {
    const text = "size, resize, oversized, seize, prize, capsized, maize, citizen, wizard";
    expect(uk(text)).toBe(text);
  });

  it("leaves -or words that are the same in the UK alone", () => {
    const text = "doctor actor error motor humorous laborious honorary vigorous";
    expect(uk(text)).toBe(text);
  });

  it("leaves -er words that are the same in the UK alone", () => {
    const text = "meter parameter water computer diameter";
    expect(uk(text)).toBe(text);
    expect(uk("Ten kilometers")).toBe("Ten kilometres");
  });

  it("leaves capitalised words mid-sentence alone because they are probably names", () => {
    const text = "We met at Lincoln Center near Pearl Harbor.";
    expect(uk(text)).toBe(text);
  });

  it("treats the start of a line or sentence as a normal word", () => {
    expect(uk("Hello.\nColor matters. Behavior too!")).toBe("Hello.\nColour matters. Behaviour too!");
  });

  it("leaves code-like mixed-case words alone", () => {
    expect(uk("Use the ColorPicker widget.")).toBe("Use the ColorPicker widget.");
  });

  it("keeps possessives intact", () => {
    expect(uk("the color's depth")).toBe("the colour's depth");
  });

  it("reports each change with a count", () => {
    expect(toUkSpelling("color, color, organize").changes).toEqual([
      { from: "color", to: "colour", count: 2 },
      { from: "organize", to: "organise", count: 1 },
    ]);
  });

  it("returns British text unchanged", () => {
    const text = "The colour of the centre, organised and analysed.";
    expect(toUkSpelling(text)).toEqual({ text, changes: [] });
  });
});
