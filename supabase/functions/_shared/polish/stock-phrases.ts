// Stock phrases that mark text as AI-written, with plain replacements.
// swap: replace the phrase. cut: delete it (and an aside's commas). sentence: delete a whole
// stock sentence, only when it starts a sentence.
import type { PhraseHit } from "./report.ts";
import { applyCapitaliseMarks, CAPITALISE_MARK, isSentenceStart, matchCase, tidy } from "./text.ts";

export type PhraseKind = "swap" | "cut" | "sentence";

export interface StockPhrase {
  find: string;
  replace: string;
  kind: PhraseKind;
  /** Optional lookahead source that must also match straight after the phrase. */
  next?: string;
}

const swap = (find: string, replace: string, next?: string): StockPhrase => ({ find, replace, kind: "swap", next });
// Leverage the verb takes an object; leverage the noun ("leverage over suppliers") must stay.
const LEVERAGE_OBJECT =
  "(?=[ \\t]+(?:our|your|the|their|its|this|these|those|existing|my|his|her|it|them|data|ai|technology)(?![\\p{L}]))";
const PERSON_NEXT =
  "(?=[ \\t]+(?:me|us|you|him|her|them|our|your|my|his|their|the|a|an|any|anyone|someone|everyone)(?![\\p{L}]))";
const cut = (find: string): StockPhrase => ({ find, replace: "", kind: "cut" });
const sentence = (find: string): StockPhrase => ({ find, replace: "", kind: "sentence" });

export const STOCK_PHRASES: readonly StockPhrase[] = [
  // Openers and fillers that add nothing.
  cut("in today's fast-paced world"),
  cut("in today's digital age"),
  cut("in today's world"),
  cut("it's worth noting that"),
  cut("it is worth noting that"),
  cut("it's important to note that"),
  cut("it is important to note that"),
  cut("it's important to remember that"),
  cut("it is important to remember that"),
  cut("it goes without saying that"),
  cut("needless to say"),
  cut("in conclusion"),
  cut("in summary"),
  cut("to summarise"),
  cut("to summarize"),
  cut("all in all"),
  cut("in essence"),
  cut("at its core"),
  cut("in a nutshell"),
  cut("rest assured"),
  cut("as an ai language model"),

  // Whole stock sentences.
  sentence("i hope this email finds you well"),
  sentence("i hope this message finds you well"),
  sentence("i hope you're doing well"),
  sentence("i hope you are doing well"),
  sentence("i hope this helps"),
  sentence("i'd be happy to help"),
  sentence("great question"),
  sentence("certainly"),
  sentence("absolutely"),
  sentence("look no further"),
  sentence("let's dive in"),

  // Linking words.
  swap("moreover", "also"),
  swap("furthermore", "also"),
  swap("additionally", "also"),
  swap("that being said", "even so"),
  swap("with that being said", "even so"),
  swap("first and foremost", "first"),
  swap("last but not least", "finally"),
  swap("at the end of the day", "ultimately"),
  swap("when it comes to", "for", "(?![ \\t]+it(?![\\p{L}]))"),
  swap("in order to", "to"),
  swap("due to the fact that", "because"),

  // Inflated verbs and nouns.
  swap("delve into", "look at"),
  swap("delves into", "looks at"),
  swap("delving into", "looking at"),
  swap("delved into", "looked at"),
  swap("let's dive into", "let's look at"),
  swap("deep dive", "close look"),
  swap("a testament to", "proof of"),
  swap("stands as a testament to", "shows"),
  swap("plays a crucial role in", "is key to"),
  swap("plays a pivotal role in", "is key to"),
  swap("plays a vital role in", "is key to"),
  swap("navigate the complexities of", "deal with"),
  swap("navigating the complexities of", "dealing with"),
  swap("the intricacies of", "the details of"),
  swap("a rich tapestry of", "a mix of"),
  swap("a tapestry of", "a mix of"),
  swap("unlock the full potential of", "get the most from"),
  swap("unlock the potential of", "make the most of"),
  swap("unleash the power of", "use"),
  swap("harness the power of", "use"),
  swap("take it to the next level", "improve it"),
  swap("game-changer", "big change"),
  swap("game-changing", "major"),
  swap("cutting-edge", "modern"),
  swap("state-of-the-art", "modern"),
  swap("seamless", "smooth"),
  swap("seamlessly", "smoothly"),
  swap("leverage", "use", LEVERAGE_OBJECT),
  swap("leverages", "uses", LEVERAGE_OBJECT),
  swap("leveraged", "used", LEVERAGE_OBJECT),
  swap("leveraging", "using", LEVERAGE_OBJECT),
  swap("utilize", "use"),
  swap("utilise", "use"),
  swap("utilizes", "uses"),
  swap("utilises", "uses"),
  swap("utilized", "used"),
  swap("utilised", "used"),
  swap("utilizing", "using"),
  swap("utilising", "using"),
  swap("utilization", "use"),
  swap("utilisation", "use"),
  swap("a myriad of", "many"),
  swap("a plethora of", "plenty of"),
  swap("ever-evolving", "changing"),
  swap("ever-changing", "changing"),
  swap("in the ever-evolving world of", "in"),
  swap("in the ever-evolving landscape of", "in"),
  swap("in the realm of", "in"),
  swap("nestled in", "in"),
  swap("embark on", "start"),
  swap("embarks on", "starts"),
  swap("embarking on", "starting"),
  swap("embarked on", "started"),
  swap("a wide array of", "a range of"),
  swap("pave the way for", "lead to"),
  swap("paves the way for", "leads to"),
  swap("paving the way for", "leading to"),
  swap("paved the way for", "led to"),
  swap("shed light on", "explain"),
  swap("sheds light on", "explains"),
  swap("shedding light on", "explaining"),
  swap("revolutionize", "change"),
  swap("revolutionise", "change"),
  swap("revolutionizes", "changes"),
  swap("revolutionises", "changes"),
  swap("revolutionizing", "changing"),
  swap("revolutionising", "changing"),

  // Sign-offs.
  swap("feel free to reach out", "get in touch"),
  swap("don't hesitate to reach out", "get in touch"),
  swap("do not hesitate to reach out", "get in touch"),
  // Only before a person or group: "reach out to confirm" must not become "contact confirm".
  swap("reach out to", "contact", PERSON_NEXT),
];

const START = "(?<![\\p{L}\\p{N}_'’-])";
const END = "(?![\\p{L}\\p{N}_-])";

function phrasePattern(find: string): string {
  return [...find]
    .map((ch) => {
      if (ch === "'") return "['’]";
      if (ch === " ") return "[ \\t\\u00a0]+";
      if (ch === "-") return "[- ]?";
      return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
}

function compile(phrase: StockPhrase): RegExp {
  const body = START + phrasePattern(phrase.find);
  if (phrase.kind === "swap") return new RegExp(body + END + (phrase.next ?? ""), "giu");
  if (phrase.kind === "cut") return new RegExp(`(,[ \\t]*)?${body}${END}(,)?[ \\t]*`, "giu");
  return new RegExp(`${body}(?:[.!]+|(?=\\n)|$)[ \\t]*`, "giu");
}

// Longest first, so "with that being said" wins over "that being said".
const COMPILED = [...STOCK_PHRASES]
  .sort((a, b) => b.find.length - a.find.length)
  .map((phrase) => ({ phrase, regex: compile(phrase) }));

export interface StockPhraseResult {
  text: string;
  hits: PhraseHit[];
}

export function stripStockPhrases(input: string): StockPhraseResult {
  const counts = new Map<string, number>();
  const hit = (find: string) => counts.set(find, (counts.get(find) ?? 0) + 1);
  let text = input;

  for (const { phrase, regex } of COMPILED) {
    text = text.replace(regex, (match: string, ...args: unknown[]) => {
      if (phrase.kind === "swap") {
        hit(phrase.find);
        return matchCase(match, phrase.replace);
      }
      if (phrase.kind === "cut") {
        const [lead, , offset, whole] = args as [string | undefined, string | undefined, number, string];
        hit(phrase.find);
        if (lead) return " ";
        return isSentenceStart(whole, offset) ? CAPITALISE_MARK : "";
      }
      const [offset, whole] = args as [number, string];
      if (!isSentenceStart(whole, offset)) return match;
      hit(phrase.find);
      return CAPITALISE_MARK;
    });
  }

  if (counts.size === 0) return { text: input, hits: [] };
  const hits = [...counts]
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => a.phrase.localeCompare(b.phrase));
  return { text: tidy(applyCapitaliseMarks(text)), hits };
}
