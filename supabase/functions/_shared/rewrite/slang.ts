// Slang, text abbreviations and strong dialect words (Cam, 15 Oct): Polisher may use one only when
// the person's own samples use it (or the draft already does). The list is what the rewrite rule
// names and what npm run eval:q1 counts as "slang added". Words that are also ordinary English
// in other senses (proper, mint, bare, sound) are left out, so the count never flags normal writing.
import { applyCapitaliseMarks, CAPITALISE_MARK, isSentenceStart, matchCase, tidy } from "../polish/text.ts";

export const SLANG: readonly string[] = [
  // Text abbreviations and chat spellings.
  "lol", "lmao", "lmfao", "rofl", "tbh", "tbf", "ngl", "imo", "imho", "idk", "idc", "omg", "omfg", "rn", "fr", "smh",
  "wbu", "hbu", "hmu", "ikr", "irl", "btw", "brb", "ttyl", "ty", "thx", "tho", "pls", "plz", "cya", "u", "ur", "ya",
  "coz", "cos", "cuz", "gonna", "wanna", "gotta", "dunno", "haha", "hahaha", "yeah", "yep", "yup", "nah",
  // British and Scottish slang and dialect.
  "innit", "bruv", "mate", "cheers", "chuffed", "knackered", "gutted", "skint", "minging", "gaff", "quid", "cheeky",
  "banter", "bants", "lad", "lads", "bloody", "blimey", "wee", "aye", "cannae", "dinnae", "wouldnae", "isnae", "peng",
];

const LISTED = new Set(SLANG);
const tokens = (text: string) => text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];

/** The listed words used at least minUses times across these texts, once each, in list order. */
export function slangIn(texts: readonly string[], minUses = 1): string[] {
  const counts = new Map<string, number>();
  for (const t of texts.flatMap(tokens)) if (LISTED.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return SLANG.filter((word) => (counts.get(word) ?? 0) >= minUses);
}

// Cam's stricter rule (15 Oct): a word used once in the samples is not a habit, so it takes two.
export const MIN_SAMPLE_USES = 2;

/** The slang the person's samples use often enough to count as theirs (what the rewrite rule names). */
export const slangUsedOften = (samples: readonly string[]) => slangIn(samples, MIN_SAMPLE_USES);

/**
 * The slang a rewrite may contain: the draft's own (it is the person's input, and may be quoted),
 * plus, in an informal message only, the slang their samples use often. Never any in a formal one.
 */
export function allowedSlang(samples: readonly string[], draft: string, formal: boolean): string[] {
  const allowed = new Set(slangIn([draft]));
  if (!formal) for (const word of slangUsedOften(samples)) allowed.add(word);
  return SLANG.filter((word) => allowed.has(word));
}

/** Listed words in the rewrite that are not allowed. Repeats counted. */
export function slangAdded(rewrite: string, allowed: readonly string[]): string[] {
  const ok = new Set(allowed);
  return tokens(rewrite).filter((t) => LISTED.has(t) && !ok.has(t));
}

// Plain words for each listed word; "" means the word is simply taken out. Used only for words
// that are not allowed (allowedSlang), so the draft's own slang is never touched.
const PLAIN: Record<string, string> = {
  lol: "", lmao: "", lmfao: "", rofl: "", haha: "", hahaha: "", tbh: "", tbf: "", ngl: "", fr: "", smh: "", omg: "",
  omfg: "", ikr: "", innit: "", bloody: "", blimey: "", cheeky: "",
  imo: "in my opinion", imho: "in my opinion", idk: "I don't know", idc: "I don't mind", rn: "right now",
  wbu: "what about you", hbu: "how about you", hmu: "get in touch", irl: "in person", btw: "by the way",
  brb: "back soon", ttyl: "speak later", ty: "thanks", thx: "thanks", tho: "though", pls: "please", plz: "please",
  cya: "see you", u: "you", ya: "you", coz: "because", cos: "because", cuz: "because", gonna: "going to",
  wanna: "want to", gotta: "have to", dunno: "don't know", yeah: "yes", yep: "yes", yup: "yes", nah: "no",
  cheers: "thanks", chuffed: "pleased", knackered: "exhausted", gutted: "disappointed", skint: "short of money",
  minging: "horrible", gaff: "place", quid: "pounds", banter: "chat", bants: "chat", wee: "little", aye: "yes",
  cannae: "can't", dinnae: "don't", wouldnae: "wouldn't", isnae: "isn't", peng: "great",
};
// Names for a person: "my mate" means a friend; "cheers mate" just addresses someone, so it goes.
const PERSON: Record<string, string> = { mate: "friend", bruv: "friend", lad: "friend", lads: "friends" };
const BEFORE_PERSON = /\b(?:my|a|your|his|her|our|their|the)\s+$/i;
// "ur" is "you're" before a description or a verb ending in -ing, and "your" before a thing.
const YOURE_NEXT = /^\s+(?:[a-z]+ing|a|an|so|not|right|welcome|late|too|very|the|always|never|just|still|really|gonna)\b/i;
const REMOVED = "\uE003";

/**
 * Takes out listed words that are not allowed (Q5, Cam: never add slang the person does not use
 * often, and none in formal messages). The rewrite rule asks the AI for this; this step makes sure of it.
 */
export function replaceAddedSlang(text: string, allowedWords: readonly string[]): { text: string; count: number } {
  const allowed = new Set(allowedWords);
  let count = 0;
  const marked = text.replace(/(?<![A-Za-z'])[A-Za-z]+(?:'[A-Za-z]+)?(?![A-Za-z'])/g, (word: string, offset: number, whole: string) => {
    const lower = word.toLowerCase();
    if (!LISTED.has(lower) || allowed.has(lower)) return word;
    count++;
    let plain = PLAIN[lower] ?? "";
    if (lower in PERSON) plain = BEFORE_PERSON.test(whole.slice(0, offset)) ? PERSON[lower]! : "";
    if (lower === "ur") plain = YOURE_NEXT.test(whole.slice(offset + word.length)) ? "you're" : "your";
    if (plain) return matchCase(word, plain);
    return isSentenceStart(whole, offset) ? `${CAPITALISE_MARK}${REMOVED}` : REMOVED;
  });
  if (count === 0) return { text, count };
  const cleaned = marked
    // A word cut from the start of a sentence takes its comma and space with it.
    .replace(new RegExp(`${CAPITALISE_MARK}${REMOVED},?[ \\t]*`, "g"), CAPITALISE_MARK)
    // A word cut mid-sentence takes the space before it.
    .replace(new RegExp(`[ \\t]*${REMOVED}`, "g"), "");
  return { text: tidy(applyCapitaliseMarks(cleaned)), count };
}

/** The rewrite rule line, naming exactly which listed words the person's own writing uses often. */
export function slangRule(often: readonly string[]): string {
  const theirs = often.length
    ? `the person's own writing often uses only these: ${often.join(", ")}. Use them only in a casual message to a friend, partner or family member, and no more often than they do; in any other message use none of them.`
    : "the person's own writing uses none often, so use none.";
  return `- Slang, text abbreviations and dialect words (for example lol, tbh, tbf, ngl, u, ur, rn, pls, haha, yeah, gonna, innit, mate, cheers, chuffed, gutted, aye): ${theirs} Never add any other slang, abbreviation or dialect word unless the draft itself already uses it, even if the profile calls the person casual. This rule comes before the profile.`;
}

/**
 * Shared rules for Q5 (Cam, 15 Oct): say whether the message is formal, and punctuate casual ones.
 * "formal" is filled after the rewrite: asked for first, it pulled the rewrite towards the draft's
 * wording (q5-strict round, 15 Oct: draft 3-grams kept 0.25 to 0.35).
 */
export const FORMAL_RULE = `- After writing, set "formal": false only for a casual message to a friend, partner or family member; true for anything else (a tutor, employer, colleague, company, landlord, customer, someone the person does not know well, or a public post).`;
export const PUNCTUATION_RULE = `- In casual messages too, use capital letters, full stops, commas and question marks where the sentences need them, as a careful texter would, even if the profile says the person often leaves them out.`;
