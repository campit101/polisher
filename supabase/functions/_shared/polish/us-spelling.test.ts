import { describe, expect, it } from "vitest";
import { polish, summariseReport } from "./index.ts";
import { toUsSpelling, UK_TO_US } from "./us-spelling.ts";

const us = (text: string) => toUsSpelling(text).text;

describe("UK_TO_US list", () => {
  it("reverses the British list, with lower-case keys that differ from their values", () => {
    expect(UK_TO_US.size).toBeGreaterThanOrEqual(300);
    for (const [gb, am] of UK_TO_US) {
      expect(gb).toBe(gb.toLowerCase());
      expect(am).not.toBe(gb);
    }
  });

  it("leaves out words American English also uses", () => {
    for (const word of ["through", "dialogue", "monologue", "prologue", "epilogue", "glamour", "doughnut"]) expect(UK_TO_US.has(word)).toBe(false);
  });
});

describe("toUsSpelling", () => {
  it("swaps listed words", () => {
    expect(us("The colour of the centre of the theatre.")).toBe("The color of the center of the theater.");
    expect(us("We travelled far to fulfil a plan on aluminium.")).toBe("We traveled far to fulfill a plan on aluminum.");
    expect(us("Our defence catalogue is grey.")).toBe("Our defense catalog is gray.");
  });

  it("keeps the case pattern of each word", () => {
    expect(us("Colour is fine. COLOUR is loud.")).toBe("Color is fine. COLOR is loud.");
  });

  it("changes common -ise and -yse words", () => {
    expect(us("organise, organisation, realised, optimising, analyse, paralysed, apologise, prioritised")).toBe(
      "organize, organization, realized, optimizing, analyze, paralyzed, apologize, prioritized",
    );
  });

  it("leaves words that end in -ise in American English too", () => {
    const text = "advertise, advise, compromise, exercise, surprise, revise, supervise, televise, expertise, promise, precise, noise, raise, wise, otherwise, analysis";
    expect(us(text)).toBe(text);
  });

  it("leaves a name in the middle of a sentence alone", () => {
    expect(us("We met at the Barbican Centre in the centre of town.")).toBe("We met at the Barbican Centre in the center of town.");
  });
});

describe("polish with American spelling", () => {
  it("swaps to American spelling, keeps quotations and says so in the report", () => {
    const result = polish('The colour scheme is finalised. She said "the colour is wrong".', "us");
    expect(result.text).toBe('The color scheme is finalized. She said "the colour is wrong".');
    expect(summariseReport(result.report)).toContain("2 words changed to American spelling");
  });

  it("is British by default, as before", () => {
    const result = polish("The color scheme is finalized.");
    expect(result.text).toBe("The colour scheme is finalised.");
    expect(summariseReport(result.report)).toContain("2 words changed to UK spelling");
  });
});
