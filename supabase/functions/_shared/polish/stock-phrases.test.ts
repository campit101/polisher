import { describe, expect, it } from "vitest";
import { STOCK_PHRASES, stripStockPhrases } from "./stock-phrases.ts";

describe("STOCK_PHRASES list", () => {
  it("has at least 60 entries", () => {
    expect(STOCK_PHRASES.length).toBeGreaterThanOrEqual(60);
  });

  it("has unique, lower-case phrases", () => {
    const finds = STOCK_PHRASES.map((p) => p.find);
    expect(new Set(finds).size).toBe(finds.length);
    for (const find of finds) expect(find).toBe(find.toLowerCase());
  });

  it("never swaps in a dash or an American -ize spelling", () => {
    for (const p of STOCK_PHRASES) {
      expect(p.replace).not.toMatch(/[—–―]/);
      expect(p.replace).not.toMatch(/iz(e|ed|es|ing)\b/);
    }
  });
});

describe("stripStockPhrases", () => {
  it("cuts an opener and capitalises what follows", () => {
    expect(stripStockPhrases("In today's fast-paced world, small firms need help.").text).toBe(
      "Small firms need help.",
    );
  });

  it("matches curly apostrophes and any capitalisation", () => {
    expect(stripStockPhrases("It’s worth noting that prices rose.").text).toBe("Prices rose.");
    expect(stripStockPhrases("IT'S WORTH NOTING THAT prices rose.").text).toBe("Prices rose.");
  });

  it("cuts an aside between commas cleanly", () => {
    expect(stripStockPhrases("This is, needless to say, important.").text).toBe("This is important.");
  });

  it("cuts a phrase at the end of a clause", () => {
    expect(stripStockPhrases("It works, in conclusion.").text).toBe("It works.");
  });

  it("cuts a phrase mid-sentence without gluing words together", () => {
    expect(stripStockPhrases("We should in essence stop.").text).toBe("We should stop.");
  });

  it("swaps phrases and keeps a leading capital", () => {
    expect(stripStockPhrases("Moreover, it works.").text).toBe("Also, it works.");
    expect(stripStockPhrases("We leverage data in order to win.").text).toBe("We use data to win.");
    expect(stripStockPhrases("Utilize the tool.").text).toBe("Use the tool.");
  });

  it("prefers the longest phrase", () => {
    expect(stripStockPhrases("With that being said, we agree.").text).toBe("Even so, we agree.");
    expect(stripStockPhrases("It stands as a testament to hard work.").text).toBe("It shows hard work.");
  });

  it("removes whole stock sentences without merging paragraphs", () => {
    expect(stripStockPhrases("Thanks for the update. I hope this helps!\n\nCam").text).toBe(
      "Thanks for the update.\n\nCam",
    );
    expect(stripStockPhrases("Hi Sam,\n\nI hope this email finds you well.\n\nThe invoice is attached.").text).toBe(
      "Hi Sam,\n\nThe invoice is attached.",
    );
    expect(stripStockPhrases("Great question! The answer is yes.").text).toBe("The answer is yes.");
  });

  it("leaves leverage the noun and the idiom when it comes to it alone", () => {
    const text = "We have leverage over suppliers. When it comes to it, we pay.";
    expect(stripStockPhrases(text)).toEqual({ text, hits: [] });
    expect(stripStockPhrases("We leveraged our network.").text).toBe("We used our network.");
  });

  it("swaps reach out to only when a person or group follows", () => {
    expect(stripStockPhrases("Please reach out to our team.").text).toBe("Please contact our team.");
    const text = "I wanted to reach out to confirm the date.";
    expect(stripStockPhrases(text)).toEqual({ text, hits: [] });
  });

  it("leaves words that merely contain a phrase alone", () => {
    expect(stripStockPhrases("The seamlessness of reutilized parts.").text).toBe("The seamlessness of reutilized parts.");
  });

  it("reports each phrase it changed with a count", () => {
    const result = stripStockPhrases("Moreover, we leverage it. Moreover, we leverage them.");
    expect(result.hits).toEqual([
      { phrase: "leverage", count: 2 },
      { phrase: "moreover", count: 2 },
    ]);
  });

  it("returns clean text unchanged with no hits", () => {
    expect(stripStockPhrases("Plain words, plainly put.")).toEqual({ text: "Plain words, plainly put.", hits: [] });
  });
});
