import { describe, expect, it } from "vitest";
import { fixFormal, formalProblems, isKind, KINDS, kindRule, suggestKind } from "./kinds.ts";

const doctor = "Hi Doctor,\n\nI wanted to ask what my upcoming appointment is regarding.\n\nCould you also let me know what you would recommend?\n\nKind regards,\nCam";
const birthday = "Happy birthday mate, hope you’re doing well. Feels mad thinking about all the good memories we’ve had. Hope you have a class day.";
const article = [
  "It is known locally as Mosi-oa-Tunya, commonly translated as “The Smoke That Thunders”, referring to the enormous plume of spray and the roar of the water. UNESCO describes it as the world’s greatest sheet of falling water. The falls stretch about 1,708 metres across.",
  "At very high flow, roughly 500 million litres of water per minute can pour over the different sections of the falls. The resulting spray can rise hundreds of metres and can be visible from tens of kilometres away.",
  "The landscape is unusual because the Zambezi does not simply tumble down a mountainside. It flows across relatively flat basalt and suddenly plunges into a narrow crack in the plateau.",
].join("\n");

describe("draft types (Cam, 15 Oct)", () => {
  it("are Work, Email, Text and Article in that order", () => {
    expect([...KINDS]).toEqual(["work", "email", "text", "article"]);
    expect(isKind("email")).toBe(true);
    expect(isKind("essay")).toBe(false);
  });

  it("suggests Email for a greeting or sign-off, Article for a long piece in paragraphs, Text for a short note, Work otherwise", () => {
    expect(suggestKind(doctor)).toBe("email");
    expect(suggestKind("Thanks for this, I'll have a look tomorrow.\n\nCheers,\nCam")).toBe("email");
    expect(suggestKind(article)).toBe("article");
    expect(suggestKind(birthday)).toBe("text");
    expect(suggestKind(Array(90).fill("The quarterly figures show steady growth in every region.").join(" "))).toBe("work");
  });

  it("gives the AI one line per type, and Email keeps the draft's greeting and sign-off", () => {
    expect(kindRule("text")).toMatch(/as casual as the person's samples/);
    expect(kindRule("email")).toMatch(/greeting and sign-off/);
    for (const kind of ["work", "email", "article"] as const) expect(kindRule(kind)).toMatch(/capital letters.*apostrophes.*no slang/);
  });
});

describe("formalProblems: what the formal types must not contain", () => {
  it("counts small-letter sentence starts, a small i, missing apostrophes and text abbreviations", () => {
    const text = "its about 1,708 metres wide. the landscape is kinda weird bc the river doesnt fall. i think we had dumb convos on your bday, tens of km away.";
    expect(formalProblems(text)).toEqual({ lowerStarts: 3, lowerI: 1, missingApostrophes: 2, abbreviations: 5 });
  });

  it("finds nothing in careful text, and ignores links, email addresses and e.g.", () => {
    expect(formalProblems("It's 5 km away, e.g. on foot. I don't mind. See www.example.com or jo@example.com.")).toEqual({ lowerStarts: 0, lowerI: 0, missingApostrophes: 0, abbreviations: 0 });
  });
});

describe("fixFormal: the tested rule after the AI for Email, Work and Article", () => {
  it("fixes sentence capitals, a small i, apostrophes and abbreviations", () => {
    const fixed = fixFormal("its about 1,708 metres wide. the landscape is kinda weird bc it doesnt fall. i think it was seen from tens of km away…", "Draft.", "article");
    expect(fixed.text).toBe("It's about 1,708 metres wide. The landscape is kind of weird because it doesn't fall. I think it was seen from tens of kilometres away…");
    expect(fixed.count).toBe(8);
    expect(formalProblems(fixed.text)).toEqual({ lowerStarts: 0, lowerI: 0, missingApostrophes: 0, abbreviations: 0 });
  });

  it("expands bday and convos, and leaves the possessive its alone", () => {
    expect(fixFormal("Happy bday. Thanks for the convos and its new look.", "Draft.", "work").text).toBe("Happy birthday. Thanks for the conversations and its new look.");
  });

  it("never touches quotations, links or abbreviations the draft itself used", () => {
    const draft = 'He said "dont worry". Our bday plan is set.';
    expect(fixFormal('he said "dont worry". our bday plan is at www.example.com/bday.', draft, "work").text).toBe('He said "dont worry". Our bday plan is at www.example.com/bday.');
  });

  it("in an Email, puts back the draft's own greeting and sign-off", () => {
    const fixed = fixFormal("hey doc, just wondering what my upcoming appointment is for.\n\nand is there anything you'd suggest i take?\n\ncam", doctor, "email");
    expect(fixed.text).toBe("Hi Doctor,\n\nJust wondering what my upcoming appointment is for.\n\nAnd is there anything you'd suggest I take?\n\nKind regards,\nCam");
  });

  it("replaces a greeting line and a sign-off the AI wrote with the draft's own", () => {
    const fixed = fixFormal("Hey Doc,\n\nJust checking in about my appointment.\n\nThanks,\nCam", doctor, "email");
    expect(fixed.text).toBe("Hi Doctor,\n\nJust checking in about my appointment.\n\nKind regards,\nCam");
  });

  it("leaves an Email alone when the draft had no greeting or sign-off", () => {
    expect(fixFormal("Just checking in about my appointment.", "Checking about my appointment.", "email").text).toBe("Just checking in about my appointment.");
  });
});
