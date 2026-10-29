import { describe, expect, it } from "vitest";
import { allowedSlang, MIN_SAMPLE_USES, replaceAddedSlang, slangAdded, slangIn, slangRule, slangUsedOften } from "./slang.ts";

describe("slangIn", () => {
  it("finds listed words once each, ignoring case, in list order", () => {
    expect(slangIn(["Tbf it was fine, TBH. tbh again", "gonna be late, yeah"])).toEqual(["tbh", "tbf", "gonna", "yeah"]);
  });

  it("matches whole words only", () => {
    expect(slangIn(["Lolly, utter, matey, cheerful, Burns night, aye-aye"])).toEqual(["aye"]);
    expect(slangIn(["Please confirm the proper form by Thursday."])).toEqual([]);
  });

  it("can ask for a minimum number of uses across all the texts", () => {
    expect(slangIn(["tbh it was fine. Tbh", "gonna be late", "yeah", "yeah"], 2)).toEqual(["tbh", "yeah"]);
  });
});

describe("slangUsedOften (Cam's stricter rule, 15 Oct)", () => {
  it("needs two uses across the samples, so a one-off is not a habit", () => {
    expect(MIN_SAMPLE_USES).toBe(2);
    expect(slangUsedOften(["tbf it was fine", "gonna rain, gonna be cold", "yeah no"])).toEqual(["gonna"]);
  });
});

describe("allowedSlang", () => {
  const samples = ["gonna rain, gonna be cold", "cheers for that, cheers"];

  it("allows the samples' often-used slang in an informal message, plus the draft's own", () => {
    expect(allowedSlang(samples, "Quick one tbh", false)).toEqual(["tbh", "gonna", "cheers"]);
  });

  it("allows only the draft's own slang in a formal message", () => {
    expect(allowedSlang(samples, "The quote was 200 quid", true)).toEqual(["quid"]);
    expect(allowedSlang(samples, "Dear Ms Grant", true)).toEqual([]);
  });
});

describe("slangAdded", () => {
  it("counts listed words that are not allowed, with repeats", () => {
    expect(slangAdded("Cheers mate, lol. tbf it's fine. Cheers!", ["tbf"])).toEqual(["cheers", "mate", "lol", "cheers"]);
  });

  it("counts nothing when every word is allowed", () => {
    expect(slangAdded("Cheers for the loan", ["cheers"])).toEqual([]);
  });
});

describe("replaceAddedSlang", () => {
  const none: string[] = [];

  it("swaps added slang for plain words and removes chat abbreviations", () => {
    expect(replaceAddedSlang("Cheers for sorting it, I'm chuffed lol.", none)).toEqual({ text: "Thanks for sorting it, I'm pleased.", count: 3 });
    expect(replaceAddedSlang("Tbh I'm gonna be late, idk why.", none)).toEqual({ text: "I'm going to be late, I don't know why.", count: 3 });
  });

  it("keeps allowed words", () => {
    expect(replaceAddedSlang("tbf I'm gonna be late. Cheers!", ["tbf", "gonna", "cheers"])).toEqual({
      text: "tbf I'm gonna be late. Cheers!",
      count: 0,
    });
  });

  it("takes the person's own slang out of a formal message", () => {
    const allowed = allowedSlang(["gonna rain, gonna be cold"], "Dear Ms Grant, I am going to be late.", true);
    expect(replaceAddedSlang("Dear Ms Grant, I'm gonna be late.", allowed)).toEqual({ text: "Dear Ms Grant, I'm going to be late.", count: 1 });
  });

  it("tidies a sign-off line and keeps capitals at the start of a sentence", () => {
    expect(replaceAddedSlang("See you then.\n\nCheers,\nCam", none)).toEqual({ text: "See you then.\n\nThanks,\nCam", count: 1 });
    expect(replaceAddedSlang("Cheers mate, see you Friday.", none)).toEqual({ text: "Thanks, see you Friday.", count: 2 });
    expect(replaceAddedSlang("Lol that was close. Yeah, fine.", none)).toEqual({ text: "That was close. Yes, fine.", count: 2 });
  });

  it("reads ur as you're before a description and as your otherwise", () => {
    expect(replaceAddedSlang("ur going to love ur new desk", none)).toEqual({ text: "you're going to love your new desk", count: 2 });
  });

  it("leaves ordinary words alone", () => {
    const text = "Please confirm the proper form by Thursday; the matey tone was cheerful.";
    expect(replaceAddedSlang(text, none)).toEqual({ text, count: 0 });
  });
});

describe("slangRule", () => {
  it("names exactly the person's often-used words, for informal messages only", () => {
    const rule = slangRule(["tbh", "tbf", "gonna", "yeah"]);
    expect(rule).toContain("the person's own writing often uses only these: tbh, tbf, gonna, yeah.");
    expect(rule).toContain("Use them only in a casual message to a friend, partner or family member");
    expect(rule).toContain("in any other message use none of them.");
    expect(rule).toContain("Never add any other slang, abbreviation or dialect word unless the draft itself already uses it");
    expect(rule).toContain("This rule comes before the profile.");
  });

  it("says use none when the samples have none often", () => {
    expect(slangRule([])).toContain("the person's own writing uses none often, so use none.");
  });
});
