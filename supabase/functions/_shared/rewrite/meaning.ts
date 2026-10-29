// Meaning checks shown as "Check these" beside each rewrite. Compares the user's draft with the
// AI's version (before the clean-up step, so the clean-up's own changes are never flagged).
// Numbers, links and quotations are reported as text from the draft. Added content and changed claims
// quote the rewrite, so a locked result leaves them out (draftSideOnly) and the locked text never leaks.

export interface MeaningWarnings {
  /** Numbers, amounts, percentages and times in the draft that the rewrite lost or changed. */
  numbers: string[];
  /** Links and email addresses in the draft that the rewrite lost or altered. */
  links: string[];
  /** Quotations whose words were changed or are missing. */
  quotationsChanged: string[];
  /** Quotations with the same words but different punctuation. */
  quotationsPunctuation: string[];
  /** Sentences, emoji and feelings in the rewrite that the draft does not have. Text from the rewrite. */
  added: string[];
  /** Claims that changed, such as "greatest → biggest". Text from both sides. */
  claims: string[];
  /** Words like not, may or will that changed, such as "not (missing)" or "may → will". Words from both sides. */
  certainty: string[];
}

// Words too common to show that a sentence came from the draft.
const STOPWORDS = new Set(
  "a an and are as at be been but by can could did do does dont for from get got had has have he her here hers him his how i im if in is it its ive just me more my no not now of oh ok okay on one or our out really she so some than that the their them then there they this to too up us very was we were what when where which who will with would yeah yes you your all any also about been being bit much".split(" "),
);
// Feelings and affection that change what a message says if the AI adds them.
const FEELINGS = /\b(?:love|loves|loved|adore|adored|proud|miss you|missed you|sorry|hate|hated|gutted|thrilled|delighted|excited|worried|disappointed|upset|heartbroken|hugs|xx+|xoxo)\b/gi;
const EMOJI = /\p{Extended_Pictographic}/gu;
const NOT_SUPERLATIVE = new Set(
  "interest honest forest request west nest chest guest rest test contest protest suggest digest arrest harvest invest modest earnest manifest pest quest vest crest priest conquest behest inquest unrest attest detest divest infest zest lest jest fest tempest bequest midwest northwest southwest everest budapest bucharest ingest congest wrest".split(" "),
);
const SUPERLATIVE = /\b(?:[a-z]{2,}est|best|worst|most|least)\b/gi;

const stem = (word: string) =>
  word
    .replace(/['’]s$/, "")
    .replace(/ies$/, "y")
    .replace(/(?<=\w{3})(?:es|s|ed|ing|ly)$/, "");
const contentStems = (text: string) =>
  (text.toLowerCase().match(/[\p{L}]+(?:['’][\p{L}]+)?/gu) ?? []).filter((w) => w.length >= 3 && !STOPWORDS.has(w.replace(/['’]/g, ""))).map(stem);

/** Sentences with no content word from the draft, then new emoji, then feelings the draft never had. */
function addedContent(draft: string, rewrite: string): string[] {
  const draftStems = new Set(contentStems(draft));
  const added: string[] = [];
  const flagged: string[] = [];
  for (const sentence of rewrite.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean)) {
    const stems = contentStems(sentence);
    if (stems.length > 0 && !stems.some((s) => draftStems.has(s))) {
      added.push(sentence);
      flagged.push(sentence.toLowerCase());
    }
  }
  for (const emoji of new Set(rewrite.match(EMOJI) ?? [])) if (!draft.includes(emoji)) added.push(emoji);
  const draftLower = draft.toLowerCase();
  for (const feeling of new Set((rewrite.match(FEELINGS) ?? []).map((f) => f.toLowerCase()))) {
    if (draftLower.match(new RegExp(`\\b${feeling}\\b`))) continue;
    if (flagged.some((s) => s.includes(feeling))) continue;
    added.push(feeling);
  }
  return added;
}

/** Superlatives that changed, went missing or were added, such as "greatest → biggest". */
function changedClaims(draft: string, rewrite: string): string[] {
  const list = (text: string) => (text.toLowerCase().match(SUPERLATIVE) ?? []).filter((w) => !NOT_SUPERLATIVE.has(w));
  const draftList = list(draft);
  const rewriteList = list(rewrite);
  const missing = draftList.filter((w) => !rewriteList.includes(w));
  const extra = rewriteList.filter((w) => !draftList.includes(w));
  const claims: string[] = [];
  for (let i = 0; i < Math.max(missing.length, extra.length); i++) {
    if (missing[i] && extra[i]) claims.push(`${missing[i]} → ${extra[i]}`);
    else if (missing[i]) claims.push(`${missing[i]} (missing)`);
    else claims.push(`${extra[i]} (not in your draft)`);
  }
  return [...new Set(claims)];
}

// Not, may and will (pre-launch review, 17 Oct). Word lists, not understanding: a
// moved or reworded negative with the same count is not flagged, and the page never says the
// checks prove the meaning is unchanged.
const NEGATIVES = ["not", "never", "no", "nothing", "none", "nobody", "neither", "nor", "nowhere", "without"];
const MAYBE = ["may", "might", "could", "should", "possibly", "perhaps", "probably", "maybe", "likely", "unlikely"];
// Adverbs first, so "might → will definitely" is reported as "might → definitely".
const SURE = ["definitely", "certainly", "surely", "guaranteed", "always", "must", "will"];
// "quite" and "rather" are left out: in British English they mostly mean degree or preference
// ("quite busy", "rather than"), which flagged a third of saved rewrites for nothing.
const HEDGES = ["fairly", "somewhat", "slightly", "reasonably", "relatively", "probably", "possibly", "perhaps", "maybe", "hopefully", "likely"];
// Negatives that are idioms or AI framings Polisher removes on purpose, not claims. Matched after
// contractions are written out. Found by measuring saved rewrites (17 Oct).
const NOT_A_CLAIM = /\b(?:not (?:just|only|merely|simply)|do not hesitate|does not hesitate|no (?:pressure|worries|problem|rush|bother|stress)|can not wait|could not be (?:more|happier|prouder)|could not have done (?:it|this))\b/g;

/** Lower case, curly apostrophes straightened, and contractions written out, so "can't" and "cannot" match. */
function certaintyWords(text: string): Map<string, number> {
  const plain = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\bcan't\b|\bcannot\b/g, "can not")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bshan't\b/g, "shall not")
    .replace(/n't\b/g, " not")
    .replace(/'ll\b/g, " will")
    .replace(NOT_A_CLAIM, " ");
  const counts = new Map<string, number>();
  for (const word of plain.match(/[a-z]+/g) ?? []) counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}

function changedCertainty(draft: string, rewrite: string): string[] {
  const before = certaintyWords(draft);
  const after = certaintyWords(rewrite);
  const diff = (word: string) => (after.get(word) ?? 0) - (before.get(word) ?? 0);
  const repeat = (words: string[], sign: 1 | -1) => words.flatMap((w) => Array<string>(Math.max(0, sign * diff(w))).fill(w));
  const found: string[] = [];

  // Negatives: only when the total changed, so "never" becoming "not ever" is left alone.
  const total = NEGATIVES.reduce((sum, w) => sum + diff(w), 0);
  if (total < 0) for (const w of NEGATIVES) if (diff(w) < 0) found.push(`${w} (missing)`);
  if (total > 0) for (const w of NEGATIVES) if (diff(w) > 0) found.push(`${w} (not in your draft)`);

  // A maybe that became a certainty, or the other way round.
  const used = new Set<string>();
  const pair = (lost: string[], gained: string[]) => {
    for (let i = 0; i < Math.min(lost.length, gained.length); i++) {
      found.push(`${lost[i]} → ${gained[i]}`);
      used.add(lost[i]!).add(gained[i]!);
    }
  };
  pair(repeat(MAYBE, -1), repeat(SURE, 1));
  pair(repeat(SURE, -1), repeat(MAYBE, 1));

  // Hedging added or taken away ("confident" becoming "fairly confident").
  for (const w of HEDGES) {
    if (used.has(w)) continue;
    if (diff(w) > 0) found.push(`${w} (not in your draft)`);
    if (diff(w) < 0) found.push(`${w} (missing)`);
  }
  return [...new Set(found)];
}

const NUMBER = /[£$€]?\d+(?:[.,:]\d+)*(?:%|k\b|m\b|bn\b)?/gi;
const LINK = /https?:\/\/[^\s<>"”]+|www\.[^\s<>"”]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const QUOTATION = /"([^"\n]*(?:\n(?!\n)[^"\n]*)*)"|“([^“”\n]*(?:\n(?!\n)[^“”\n]*)*)”/g;

/** 1,200 and 1200 are the same number; 3,5 is not touched. */
const numberKey = (token: string) => token.toLowerCase().replace(/,(?=\d{3}(?!\d))/g, "");
const trimLink = (link: string) => link.replace(/[.,;:!?)\]]+$/, "");
const wordsKey = (text: string) => ` ${text.replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

/** Draft items whose key appears fewer times in the rewrite, each reported once, in draft order. */
function missing(draftItems: string[], rewriteItems: string[], key: (item: string) => string): string[] {
  const left = new Map<string, number>();
  for (const item of rewriteItems) left.set(key(item), (left.get(key(item)) ?? 0) + 1);
  const lost: string[] = [];
  for (const item of draftItems) {
    const count = left.get(key(item)) ?? 0;
    if (count > 0) left.set(key(item), count - 1);
    else if (!lost.includes(item)) lost.push(item);
  }
  return lost;
}

const all = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((m) => m[0]);

export function checkMeaning(draft: string, rewrite: string): MeaningWarnings {
  const draftLinks = all(draft, LINK).map(trimLink);
  const rewriteLinks = all(rewrite, LINK).map(trimLink);
  // Digits inside links are checked as part of the link, not as numbers.
  const withoutLinks = (text: string) => text.replace(LINK, " ");

  const quotationsChanged: string[] = [];
  const quotationsPunctuation: string[] = [];
  const rewriteWords = wordsKey(rewrite);
  for (const match of draft.matchAll(QUOTATION)) {
    const inner = match[1] ?? match[2] ?? "";
    if (inner.trim() === "" || rewrite.includes(inner)) continue;
    const list = rewriteWords.includes(wordsKey(inner)) ? quotationsPunctuation : quotationsChanged;
    if (!list.includes(inner)) list.push(inner);
  }

  return {
    numbers: missing(all(withoutLinks(draft), NUMBER), all(withoutLinks(rewrite), NUMBER), numberKey),
    links: missing(draftLinks, rewriteLinks, (link) => link),
    quotationsChanged,
    quotationsPunctuation,
    added: addedContent(draft, rewrite),
    claims: changedClaims(draft, rewrite),
    certainty: changedCertainty(draft, rewrite),
  };
}

/**
 * Added content and changed claims on their own. The handler runs this on the final text the user
 * sees (after the slang and careful-writing fixes), so it never quotes words that were taken out.
 */
export function checkAdded(draft: string, text: string): Pick<MeaningWarnings, "added" | "claims" | "certainty"> {
  return { added: addedContent(draft, text), claims: changedClaims(draft, text), certainty: changedCertainty(draft, text) };
}

export function hasWarnings(w: MeaningWarnings): boolean {
  return w.numbers.length + w.links.length + w.quotationsChanged.length + w.quotationsPunctuation.length + w.added.length + w.claims.length + (w.certainty?.length ?? 0) > 0;
}

/**
 * A locked rewrite must not leak its text, so the parts of the check that quote the rewrite (added
 * content and the new side of a changed claim or certainty word) are left out and counted instead.
 */
export function draftSideOnly(w: MeaningWarnings): { warnings: MeaningWarnings; hidden: number } {
  return { warnings: { ...w, added: [], claims: [], certainty: [] }, hidden: w.added.length + w.claims.length + (w.certainty?.length ?? 0) };
}
