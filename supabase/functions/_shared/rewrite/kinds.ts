// Draft types (Cam, 15 Oct hands-on test): Work, Email, Text, Article. The Write page suggests one and
// the user can change it. Text may stay as casual as the person's own samples. Email, Work and Article
// get careful writing, made sure of by fixFormal after the AI: sentence capitals, a capital I,
// apostrophes, no text abbreviations, and in an Email the draft's own greeting and sign-off.

export const KINDS = ["work", "email", "text", "article"] as const;
export type Kind = (typeof KINDS)[number];
export const isKind = (value: unknown): value is Kind => (KINDS as readonly unknown[]).includes(value);
/** Text may follow the person's casual habits; the other types are written carefully. */
export const isFormalKind = (kind: Kind) => kind !== "text";

const GREETING_LINE = /^(?:dear|hi|hiya|hello|hey|good (?:morning|afternoon|evening))\b[^\n.!?]{0,40}[,!]?$/i;
const GREETING_PREFIX = /^(?:dear|hi|hiya|hello|hey)\s+[^,\n.!?]{1,25},\s+(?=\S)/i;
const SIGN_OFF = /^(?:kind regards|best regards|warm regards|regards|best wishes|best|all the best|many thanks|thanks(?: again| so much)?|thank you|cheers|sincerely|yours sincerely|yours faithfully|take care|speak soon)[,!.]?$/i;
const NAME_LINE = /^[\p{L}][\p{L}'’ .-]{0,30}$/u;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

/** The draft's greeting line, if it opens with one. */
function greetingOf(text: string): string | null {
  const first = lines(text)[0] ?? "";
  return GREETING_LINE.test(first) && words(first) <= 6 ? first : null;
}

/** The draft's closing lines ("Kind regards," then a name, or a sign-off alone), if it ends with them. */
function signOffOf(text: string): string[] | null {
  const all = lines(text);
  const last = all.at(-1) ?? "";
  const before = all.at(-2) ?? "";
  if (all.length >= 2 && SIGN_OFF.test(before) && NAME_LINE.test(last) && words(last) <= 3) return [before, last];
  if (SIGN_OFF.test(last)) return [last];
  return null;
}

export function suggestKind(draft: string): Kind {
  if (greetingOf(draft) || signOffOf(draft)) return "email";
  const count = words(draft);
  if (count <= 60) return "text";
  if (count >= 100 && lines(draft).length >= 2) return "article";
  return "work";
}

const CAREFUL = "Write it in full, careful sentences in the person's voice: capital letters at the start of sentences, a capital I, apostrophes in words like don't and it's, and no slang or text abbreviations (such as bc, kinda, bday, convos or u).";

/** The one line the rewrite prompt gets for the type the user chose. */
export function kindRule(kind: Kind): string {
  switch (kind) {
    case "text":
      return "- The person says this is a text message to someone they know. Keep it as casual as the person's samples are, and no more casual than that.";
    case "email":
      return `- The person says this is an email. ${CAREFUL} Keep the draft's greeting and sign-off exactly as written.`;
    case "work":
      return `- The person says this is a piece of work (an essay, report, questionnaire answer or document for a job or project). ${CAREFUL}`;
    case "article":
      return `- The person says this is an article or post for others to read. ${CAREFUL}`;
  }
}

// --- checks and fixes ---------------------------------------------------------------------------

/** Text abbreviations and chat spellings that careful writing spells out. */
const ABBREVIATIONS: Record<string, string> = {
  bc: "because", "b/c": "because", cuz: "because", coz: "because", cos: "because", kinda: "kind of", sorta: "sort of",
  bday: "birthday", convo: "conversation", convos: "conversations", gonna: "going to", wanna: "want to", gotta: "have to",
  dunno: "don't know", tbh: "to be honest", tbf: "to be fair", imo: "in my opinion", btw: "by the way", rn: "right now",
  u: "you", ur: "your", pls: "please", plz: "please", thx: "thanks", tho: "though", idk: "I don't know", lol: "", haha: "",
};
// km is fine after a number (5 km) and an abbreviation anywhere else (tens of km).
const ABBREVIATION = /(?<![\p{L}\p{N}'’/.@-])(b\/c|[a-z]+)(?![\p{L}\p{N}'’/@-]|\.[a-z])/giu;
const KM = /(?<!\d\s?)\bkm\b/g;

const APOSTROPHES: Record<string, string> = {
  dont: "don't", doesnt: "doesn't", didnt: "didn't", cant: "can't", couldnt: "couldn't", shouldnt: "shouldn't",
  wouldnt: "wouldn't", isnt: "isn't", arent: "aren't", wasnt: "wasn't", werent: "weren't", havent: "haven't",
  hasnt: "hasn't", hadnt: "hadn't", mustnt: "mustn't", neednt: "needn't", im: "I'm", ive: "I've", youre: "you're",
  youve: "you've", youll: "you'll", theyre: "they're", theyve: "they've", theyll: "they'll", thats: "that's",
  whats: "what's", theres: "there's", heres: "here's", wheres: "where's", whos: "who's",
};
// "its" is the possessive unless a contraction is clearly meant: "its about", "its really", "its going".
const ITS_CONTRACTION = /\bits(?=\s+(?:a|an|the|about|been|not|so|very|really|just|only|all|going|quite|too|also|still|probably|actually|always|never|like|kinda|kind|pretty|getting|more|less|[a-z]+ing)\b)/gi;
const NOT_A_SENTENCE_END = /\b(?:e\.g|i\.e|etc|vs|approx|no|st|dr|mr|mrs|ms)\.$/i;
const PROTECTED = /"[^"\n]*"|“[^”\n]*”|https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

const matchFirst = (from: string, to: string) => (from[0] && from[0] === from[0].toUpperCase() && from[0] !== from[0].toLowerCase() ? to.charAt(0).toUpperCase() + to.slice(1) : to);

/** Runs `fix` on the parts of the text outside quotations, links and email addresses. */
function outsideProtected(text: string, fix: (part: string) => string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(PROTECTED)) {
    out += fix(text.slice(last, m.index)) + m[0];
    last = m.index! + m[0].length;
  }
  return out + fix(text.slice(last));
}

/** Offsets of letters that start a sentence or a line but are not capitals. */
function lowerStarts(text: string): number[] {
  const out: number[] = [];
  const re = /(^|\n|[.!?…]["'”’)\]]*[ \t]+)(["'“‘(\[]*)(\p{Ll})/gu;
  for (const m of text.matchAll(re)) {
    const before = text.slice(0, m.index! + m[1]!.length).trimEnd();
    if (m[1] !== "" && m[1] !== "\n" && NOT_A_SENTENCE_END.test(before)) continue;
    const at = m.index! + m[1]!.length + m[2]!.length;
    const word = /^[\p{L}.\/:@]+/u.exec(text.slice(at))?.[0] ?? "";
    if (/^(?:www\.|https?:)/.test(word) || word.includes("@")) continue;
    out.push(at);
  }
  return out;
}

export interface FormalProblems {
  lowerStarts: number;
  lowerI: number;
  missingApostrophes: number;
  abbreviations: number;
}

/** What careful writing must not contain (used by the eval and the tests). */
export function formalProblems(text: string): FormalProblems {
  let lowerI = 0;
  let missingApostrophes = 0;
  let abbreviations = 0;
  let starts = 0;
  outsideProtected(text, (part) => {
    starts += lowerStarts(part).length;
    lowerI += (part.match(/(?<![\p{L}'’])i(?=['’][a-z]|(?![\p{L}'’]))/gu) ?? []).length;
    for (const w of part.toLowerCase().match(/[a-z]+/g) ?? []) if (w in APOSTROPHES) missingApostrophes++;
    missingApostrophes += (part.match(ITS_CONTRACTION) ?? []).length;
    for (const m of part.matchAll(ABBREVIATION)) if (m[1]!.toLowerCase() in ABBREVIATIONS) abbreviations++;
    abbreviations += (part.match(KM) ?? []).length;
    return part;
  });
  return { lowerStarts: starts, lowerI, missingApostrophes, abbreviations };
}

/** Puts back the draft's greeting and sign-off in an Email, replacing any the AI wrote instead. */
function keepEmailFrame(text: string, draft: string): string {
  let out = text.trim();
  const greeting = greetingOf(draft);
  if (greeting) {
    const [first = "", ...rest] = out.split("\n");
    if (GREETING_LINE.test(first.trim()) && words(first) <= 6) out = rest.join("\n").replace(/^\s+/, "");
    else out = out.replace(GREETING_PREFIX, "");
    out = `${greeting}\n\n${out}`;
  }
  const signOff = signOffOf(draft);
  if (signOff) {
    const body = out.split("\n");
    const trimmed = () => (body.at(-1) ?? "").trim();
    while (body.length && trimmed() === "") body.pop();
    const name = signOff.length === 2 ? signOff[1]!.toLowerCase() : null;
    if (name && trimmed().toLowerCase() === name) body.pop();
    else if (NAME_LINE.test(trimmed()) && words(trimmed()) <= 3 && SIGN_OFF.test((body.at(-2) ?? "").trim())) body.pop();
    while (body.length && trimmed() === "") body.pop();
    if (SIGN_OFF.test(trimmed())) body.pop();
    while (body.length && trimmed() === "") body.pop();
    out = `${body.join("\n")}\n\n${signOff.join("\n")}`;
  }
  return out;
}

/**
 * The tested rule after the AI for Email, Work and Article. Never touches quotations, links, email
 * addresses or abbreviations the draft itself used. `count` is the number of fixes made.
 */
export function fixFormal(text: string, draft: string, kind: Kind): { text: string; count: number } {
  if (!isFormalKind(kind)) return { text, count: 0 };
  const draftWords = new Set(draft.toLowerCase().match(/[a-z]+(?:\/[a-z]+)?/g) ?? []);
  let count = 0;
  let out = kind === "email" ? keepEmailFrame(text, draft) : text;
  out = outsideProtected(out, (part) =>
    part
      .replace(ABBREVIATION, (whole: string, word: string) => {
        const lower = word.toLowerCase();
        if (!(lower in ABBREVIATIONS) || draftWords.has(lower)) return whole;
        count++;
        return matchFirst(word, ABBREVIATIONS[lower]!);
      })
      .replace(KM, () => {
        if (draftWords.has("km")) return "km";
        count++;
        return "kilometres";
      })
      .replace(/[a-z]+/gi, (w: string) => {
        const fixed = APOSTROPHES[w.toLowerCase()];
        if (!fixed || draftWords.has(w.toLowerCase())) return w;
        count++;
        return fixed === "I'm" || fixed === "I've" ? fixed : matchFirst(w, fixed);
      })
      .replace(ITS_CONTRACTION, (w: string) => {
        count++;
        return matchFirst(w, "it's");
      })
      .replace(/ {2,}/g, " ")
      .replace(/ +([.,;:!?])/g, "$1"),
  );
  out = outsideProtected(out, (part) => {
    const at = new Set(lowerStarts(part));
    count += at.size;
    let fixed = part.split("").map((ch, i) => (at.has(i) ? ch.toUpperCase() : ch)).join("");
    fixed = fixed.replace(/(?<![\p{L}'’])i(?=['’][a-z]|(?![\p{L}'’]))/gu, () => {
      count++;
      return "I";
    });
    return fixed;
  });
  return { text: out, count };
}
