import { describe, expect, it } from "vitest";
import { checkAdded, checkMeaning, draftSideOnly, hasWarnings } from "./meaning.ts";

describe("checkMeaning", () => {
  it("finds nothing when numbers, links and quotations all survive", () => {
    const draft = 'We sold 1,200 units for £5 each (25% up). Details at https://example.com/a or ann@example.com. She said "keep going".';
    const rewrite = 'We sold 1200 units at £5 each, 25% up. See https://example.com/a or ann@example.com. She said “keep going”.';
    const warnings = checkMeaning(draft, rewrite);
    expect(warnings).toEqual({ numbers: [], links: [], quotationsChanged: [], quotationsPunctuation: [], added: [], claims: [], certainty: [] });
    expect(hasWarnings(warnings)).toBe(false);
  });

  it("lists numbers from the draft that are missing or changed", () => {
    const warnings = checkMeaning("Meet at 10:30 on 25 October, budget £3.5k, 2 rooms and 2 desks.", "Meet at 10:00 on 25 October, budget £3.5k, 2 rooms and desks.");
    expect(warnings.numbers).toEqual(["10:30", "2"]);
  });

  it("does not flag a number written the same way twice in the draft and once in the rewrite only once", () => {
    expect(checkMeaning("5 apples and 5 pears", "5 apples and pears").numbers).toEqual(["5"]);
  });

  it("lists links and email addresses that are missing or altered", () => {
    const warnings = checkMeaning("Go to www.example.com/sign-up. Email bob@example.com.", "Go to www.example.com/signup. Email us.");
    expect(warnings.links).toEqual(["www.example.com/sign-up", "bob@example.com"]);
  });

  it("separates quotations that only changed punctuation from ones with changed words", () => {
    const draft = 'He wrote "we will, of course, leverage the data" and "ship it today".';
    const rewrite = 'He wrote "we will of course leverage the data" and "ship it tomorrow".';
    const warnings = checkMeaning(draft, rewrite);
    expect(warnings.quotationsPunctuation).toEqual(["we will, of course, leverage the data"]);
    expect(warnings.quotationsChanged).toEqual(["ship it today"]);
  });

  it("treats a quotation whose words are gone as changed", () => {
    expect(checkMeaning('She said “never on a Sunday”.', "She refused Sunday work.").quotationsChanged).toEqual(["never on a Sunday"]);
  });

  it("does not count straight and curly quotation marks as a change", () => {
    expect(hasWarnings(checkMeaning('"Yes," she said.', "“Yes,” she said."))).toBe(false);
  });

  it("only ever reports text from the draft, never from the rewrite", () => {
    const warnings = checkMeaning('Pay £40 by "Friday noon" at https://a.example/x', 'Pay £45 by "Monday" at https://b.example/y');
    expect(warnings).toEqual({ numbers: ["£40"], links: ["https://a.example/x"], quotationsChanged: ["Friday noon"], quotationsPunctuation: [], added: expect.any(Array), claims: [], certainty: expect.any(Array) });
  });
});

describe("checkMeaning: added content and changed claims (Cam's hands-on test, 15 Oct)", () => {
  const birthday = "Happy birthday mate, hope you’re doing well. Feels mad thinking about all the good memories we’ve had, all the laughs, random nights out. Hope you have a class day and plenty more good memories to come.";

  it("flags a sentence and an emoji the draft never had", () => {
    const rewrite = "Happy birthday mate. Feels mad thinking about all the good times, the laughs and random nights out. Hope you have a class day and loads more good times to come. love you 😂";
    expect(checkMeaning(birthday, rewrite).added).toEqual(["love you 😂", "😂"]);
  });

  it("flags affection or feelings the draft did not express, even inside a reworded sentence", () => {
    const rewrite = "Happy birthday mate, so proud of you. Feels mad thinking about all the good memories, the laughs and random nights out. Hope you have a class day.";
    expect(checkMeaning(birthday, rewrite).added).toEqual(["proud"]);
  });

  it("does not flag reworded sentences that keep the draft's content", () => {
    const rewrite = "Happy birthday mate, hope all's well. Mad to think of all the good memories, the laughs, the random nights out. Have a class day, and here's to plenty more good memories.";
    expect(checkMeaning(birthday, rewrite).added).toEqual([]);
  });

  it("flags a changed claim: greatest became biggest", () => {
    const draft = "UNESCO describes it as the world’s greatest sheet or curtain of falling water.";
    expect(checkMeaning(draft, "UNESCO calls it the world’s biggest sheet or curtain of falling water.").claims).toEqual(["greatest → biggest"]);
    expect(checkMeaning(draft, "UNESCO calls it a big sheet of falling water.").claims).toEqual(["greatest (missing)"]);
    expect(checkMeaning("UNESCO describes it as a sheet of falling water.", "UNESCO calls it the best sheet of falling water.").claims).toEqual(["best (not in your draft)"]);
  });

  it("does not mistake ordinary words ending in -est for claims", () => {
    expect(checkMeaning("I am interested in the latest test.", "Honestly, I'm interested in the latest test results from the west.").claims).toEqual([]);
  });
});

describe("checkMeaning: not, may and will (pre-launch review, 17 Oct)", () => {
  const certainty = (draft: string, rewrite: string) => checkMeaning(draft, rewrite).certainty;

  it("flags a lost or added not, never or no", () => {
    expect(certainty("We cannot refund the deposit.", "We can refund the deposit.")).toEqual(["not (missing)"]);
    expect(certainty("I will never share your details.", "I will share your details.")).toEqual(["never (missing)"]);
    expect(certainty("The room is free on Friday.", "The room is not free on Friday.")).toEqual(["not (not in your draft)"]);
    expect(certainty("There is a fee.", "There is no fee.")).toEqual(["no (not in your draft)"]);
  });

  it("treats contractions and their full forms as the same words", () => {
    expect(certainty("I can't make it and won't be late again.", "I cannot make it and will not be late again.")).toEqual([]);
    expect(certainty("We don't open on Sundays.", "We don’t open on Sundays.")).toEqual([]);
    expect(certainty("We do not open on Sundays.", "We're closed on Sundays, we don't open.")).toEqual([]);
  });

  it("does not flag a negative that only moved, as long as the count stays the same", () => {
    expect(certainty("Not everyone can come, and I never said they could.", "I never said everyone could come, and not all of them can.")).toEqual([]);
  });

  it("flags a maybe that became a certainty, and the other way round", () => {
    expect(certainty("The parcel may arrive on Monday.", "The parcel will arrive on Monday.")).toEqual(["may → will"]);
    expect(certainty("It might rain, so bring a coat.", "It will definitely rain, so bring a coat.")).toEqual(["might → definitely"]);
    expect(certainty("We will finish by Friday.", "We should finish by Friday.")).toEqual(["will → should"]);
  });

  it("flags hedging that was added or taken away", () => {
    expect(certainty("We are confident it works.", "We're fairly confident it works.")).toEqual(["fairly (not in your draft)"]);
    expect(certainty("I'm probably free on Saturday.", "I'm free on Saturday.")).toEqual(["probably (missing)"]);
  });

  it("ignores negative idioms and the AI framings Polisher takes out on purpose (measured on saved rewrites, 17 Oct)", () => {
    expect(certainty("It\x27s not just a new job, it\x27s a chance to build something.", "It\x27s a chance to build something new.")).toEqual([]);
    expect(certainty("Please don\x27t hesitate to reach out with questions.", "Ask me if you have questions.")).toEqual([]);
    expect(certainty("I understand if it doesn\x27t suit, so no pressure at all.", "I understand if it doesn\x27t suit.")).toEqual([]);
    expect(certainty("I can\x27t wait to see you, and I couldn\x27t be more thrilled.", "Looking forward to seeing you, I\x27m thrilled.")).toEqual([]);
    expect(certainty("I would like a refund rather than a replacement. It was quite busy.", "I\x27d like a refund instead of a replacement. It was busy.")).toEqual([]);
  });

  it("leaves ordinary rewording alone", () => {
    expect(certainty("I will send the report on Monday and call you after.", "I'll send the report on Monday, then call you.")).toEqual([]);
    expect(certainty("Could you send me the form?", "Could you send the form over?")).toEqual([]);
  });

  it("is part of the warnings, runs on the final text, and is hidden from a locked rewrite", () => {
    expect(hasWarnings(checkMeaning("We cannot come.", "We can come."))).toBe(true);
    expect(checkAdded("We cannot come.", "We can come.").certainty).toEqual(["not (missing)"]);
    const { warnings, hidden } = draftSideOnly(checkMeaning("The fee may rise.", "The fee will rise."));
    expect(warnings.certainty).toEqual([]);
    expect(hidden).toBe(1);
  });
});
