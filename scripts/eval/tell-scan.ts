// AI-tell scanner used to score rewrites (development and evaluation only, never shipped to users).
// A TypeScript port of the surface metrics in ccf/humanize skills/humanize/scripts/surface_scan.py
// (MIT, Copyright (c) 2026 ccf, https://github.com/ccf/humanize at db51ff3). It reports numbers, not
// verdicts: no metric proves who wrote a text. tests/unit/tell-scan.test.ts checks the port against the
// assertions ccf's own tests make on its fixtures.

const ABBREVIATIONS = new Set(["dr", "mr", "mrs", "ms", "prof", "sr", "jr", "st", "vs", "etc", "e.g", "i.e", "fig", "inc", "ltd", "co", "u.s", "a.m", "p.m", "approx", "dept", "est"]);

const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const SENT_END_RE = /[.!?]+["'”’)\]]*(?=\s+["'“‘(\[]*[A-Z0-9])/g;

export const words = (text: string) => text.match(WORD_RE) ?? [];

/** Removes code, links and markup so they do not count as prose. */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*?)?\/?>/g, "");
}

export const splitParagraphs = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const para of splitParagraphs(text)) {
    const flat = para.replace(/\s+/g, " ");
    let start = 0;
    for (const m of flat.matchAll(SENT_END_RE)) {
      const prev = /(\S+)$/.exec(flat.slice(start, m.index));
      const tok = prev ? prev[1]!.toLowerCase().replace(/^["'“”‘’()[\]]+|["'“”‘’()[\]]+$/g, "") : "";
      if (m[0][0] === "." && (ABBREVIATIONS.has(tok) || (tok.length === 1 && /\p{L}/u.test(tok)))) continue;
      out.push(flat.slice(start, m.index + m[0].length).trim());
      start = m.index + m[0].length;
    }
    const tail = flat.slice(start).trim();
    if (tail) out.push(tail);
  }
  return out;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;
const per1k = (count: number, n: number) => (n ? round((count * 1000) / n, 1) : 0);

function lengthStats(lengths: number[]) {
  if (lengths.length === 0) return { mean: 0, cv: 0, longestFlatRun: 0, pctOver30: 0 };
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const sd = lengths.length > 1 ? Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / (lengths.length - 1)) : 0;
  let best = 1;
  let run = 1;
  let anchor = lengths[0]!;
  for (const x of lengths.slice(1)) {
    if (Math.abs(x - anchor) <= 3) run++;
    else {
      run = 1;
      anchor = x;
    }
    best = Math.max(best, run);
  }
  return {
    mean: round(mean, 2),
    cv: mean ? round(sd / mean, 3) : 0,
    longestFlatRun: best,
    pctOver30: round((100 * lengths.filter((x) => x > 30).length) / lengths.length, 1),
  };
}

const TRICOLON_RE = /\b[\w'’-]+(?: [\w'’-]+){0,4}, [\w'’-]+(?: [\w'’-]+){0,4},? (?:and|or) [\w'’-]+/gi;
const NOT_BUT_RE = /\bnot (?:just |only |merely |simply )?(?<x>[^.;!?]{1,60}?)[,;—–-]+ ?(?:but|rather|it'?s|it is)\b/gi;
const NOT_BUT_ISNT_ABOUT_RE = /\b(?:isn'?t|is not|wasn'?t|was not) (?:just |only |merely )?about [^.;!?]{1,60}?[,;—–-]+ ?(?:it'?s|it is|it was) about\b/gi;
const AUXILIARIES = new Set("did do does was were is are am have has had could would should will can must might may".split(" "));
const FRAME_OPENERS = new Set("the a an about that this these those what because so just only merely simply even really".split(" "));

function countNotBut(text: string): number {
  const about = [...text.matchAll(NOT_BUT_ISNT_ABOUT_RE)].map((m) => [m.index, m.index + m[0].length] as const);
  let count = about.length;
  for (const m of text.matchAll(NOT_BUT_RE)) {
    if (about.some(([s, e]) => s <= m.index && m.index < e)) continue;
    const aux = (/(\w+)\W*$/.exec(text.slice(0, m.index))?.[1] ?? "").toLowerCase();
    const xFirst = (words(m.groups?.x ?? "")[0] ?? "").toLowerCase();
    // "do not wait, but ..." is ordinary negation; "not X, but Y" framing is the tell.
    if (AUXILIARIES.has(aux) && !FRAME_OPENERS.has(xFirst)) continue;
    count++;
  }
  return count;
}

const ING_STOPLIST = new Set(
  "morning evening thing something nothing anything everything during including following according regarding concerning notwithstanding pending considering king ring spring string wing ceiling wedding clothing painting meeting training funding housing beginning".split(" "),
);
const PREP_SUB = new Set("in on at by after before during since for with from under over within when while if although as once until despite according given unlike regardless besides except beyond without throughout across".split(" "));
const SUBORDINATORS = new Set("although because while when if once since after before until unless though whereas as whenever wherever".split(" "));
const CONJ_ADVERBS = new Set(
  "however instead first second third finally meanwhile yesterday today tomorrow still then thus hence moreover furthermore nevertheless nonetheless otherwise similarly likewise consequently indeed also additionally overall ultimately importantly notably unfortunately fortunately".split(" "),
);
const FINITE_AUX = new Set("is are was were be been has have had do does did will would can could should may might must".split(" "));
const IRREGULAR_PAST = new Set(
  "grew went took held came became began brought built bought chose drew drove fought gave got kept knew met paid ran said sold sent sat shook sang slept stood struck taught told threw understood wrote dealt swept wept sought caught swung dug rode rang sank drank ate flew froze slid tore wore wove swore forgot forgave arose awoke overcame undertook withdrew".split(" "),
);
const lowerWords = (text: string) => words(text).map((w) => w.toLowerCase());
const hasFiniteVerb = (toks: string[]) => toks.some((t) => FINITE_AUX.has(t) || IRREGULAR_PAST.has(t) || (t.length > 3 && t.endsWith("ed")));

function openerKind(toks: string[]): string | null {
  if (!toks.length) return null;
  if (SUBORDINATORS.has(toks[0]!)) return "subordinator";
  if (toks.length <= 2 && CONJ_ADVERBS.has(toks[0]!)) return "conj_adverb";
  if (PREP_SUB.has(toks[0]!)) return "preposition";
  return null;
}

function isFrontedAdverbial(prefix: string): boolean {
  const segments = prefix.split(/,\s+/);
  const kind = openerKind(lowerWords(segments[0] ?? ""));
  if (kind === null) return false;
  for (const seg of segments.slice(1)) {
    const toks = lowerWords(seg);
    if (toks.length && SUBORDINATORS.has(toks[0]!)) continue;
    if (toks.length === 1) continue;
    if (toks.length && PREP_SUB.has(toks[0]!) && !hasFiniteVerb(toks)) continue;
    return false;
  }
  return kind !== "preposition" || !hasFiniteVerb(lowerWords(prefix));
}

/** ", highlighting the ..." and similar -ing riders bolted onto a finished clause. */
function participialTails(sentences: string[]): number {
  let hits = 0;
  for (const s of sentences) {
    for (const m of s.matchAll(/,\s+(?:\w+ly\s+)?(\w+ing)\b(?!-)/gi)) {
      if (ING_STOPLIST.has(m[1]!.toLowerCase())) continue;
      if (isFrontedAdverbial(s.slice(0, m.index))) continue;
      const rest = s.slice(m.index + m[0].length);
      if (/^(?:,|and\b|or\b)/i.test(rest.trimStart()) || /^\s+\w+,\s*(?:and|or)\b/i.test(rest)) continue;
      hits++;
    }
  }
  return hits;
}

export const AI_WORDLIST = [
  "a beacon of", "a testament to", "a wide range of", "at the end of the day", "bustling", "comprehensive", "crucial", "cutting-edge",
  "deep dive", "delve", "delves", "delving", "dive into", "don't hesitate", "elevate", "embark", "empower", "empowers", "ever-evolving",
  "foster", "fostering", "fosters", "furthermore", "game-changer", "great question", "harness", "holistic", "i hope this helps",
  "in conclusion", "in today's fast-paced", "intricate", "it is worth noting", "it's important to note", "it's worth noting", "landscape",
  "leverage", "leveraging", "meticulous", "meticulously", "moreover", "multifaceted", "navigate the complexities",
  "navigating the complexities", "nuanced", "paradigm", "pivotal", "plays a crucial role", "reach out", "realm", "resonate", "resonates",
  "revolutionize", "robust", "seamless", "seamlessly", "shed light", "streamline", "synergy", "tapestry", "testament to", "the world of",
  "underscore", "underscores", "unlock", "unwavering", "vibrant",
];
const HEDGES = ["arguably", "generally", "in a sense", "it could be argued", "it seems", "likely", "maybe", "might", "often", "perhaps", "potentially", "somewhat", "tend to", "tends to", "to some extent", "typically"];
const INTENSIFIERS = ["absolutely", "certainly", "deeply", "extremely", "genuinely", "highly", "incredibly", "profoundly", "remarkably", "significantly", "truly", "undeniably", "undoubtedly", "utterly", "vastly", "very"];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const termRe = (term: string) => new RegExp(`(?<![\\w'’])${escape(term).replace(/'/g, "['’]")}(?![\\w'’-])`, "gi");

function phraseHits(sentences: string[], terms: string[]) {
  const hits: { term: string; count: number }[] = [];
  for (const term of terms) {
    const count = sentences.reduce((n, s) => n + (s.match(termRe(term))?.length ?? 0), 0);
    if (count) hits.push({ term, count });
  }
  return hits.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
}

const CLOSERS = ["all in all", "in closing", "in conclusion", "in short", "in summary", "in the end", "overall", "to conclude", "to sum up", "ultimately"];
const ONE_WORD_CLOSERS = new Set(["overall", "ultimately"]);
const STOPWORDS = new Set(
  "about above after again also among because before being between could every first found great however little might never other should since still their there these thing think those three through under until where which while would".split(" "),
);
const contentWords = (text: string) => new Set(lowerWords(text).filter((w) => w.length > 4 && !STOPWORDS.has(w)));
function startsWithCloser(paragraph: string): boolean {
  const head = paragraph.toLowerCase().replace(/^[*_#> ]+/, "");
  return CLOSERS.some((c) => (ONE_WORD_CLOSERS.has(c) ? head.startsWith(`${c},`) : head.startsWith(c)));
}

/** A paragraph near the end that opens with a closer ("Ultimately, ...") and restates the body. */
function summaryCloser(paragraphs: string[]): boolean {
  if (paragraphs.length < 2) return false;
  let end = paragraphs.length;
  while (end > 1 && words(paragraphs[end - 1]!).length < 6 && !startsWithCloser(paragraphs[end - 1]!)) end--;
  for (let i = Math.max(1, end - 3); i < end; i++) {
    if (!startsWithCloser(paragraphs[i]!)) continue;
    const body = new Set(paragraphs.slice(0, i).flatMap((p) => [...contentWords(p)]));
    if ([...contentWords(paragraphs[i]!)].filter((w) => body.has(w)).length >= 2) return true;
  }
  return false;
}

function parallelOpenerRuns(sentences: string[], minRun = 3): number {
  const first = sentences.map((s) => (words(s)[0] ?? "").toLowerCase());
  let runs = 0;
  let run = 1;
  for (let i = 1; i < first.length; i++) {
    if (first[i] && first[i] === first[i - 1]) run++;
    else {
      if (run >= minRun) runs++;
      run = 1;
    }
  }
  if (run >= minRun) runs++;
  return runs;
}

export interface TellScan {
  words: number;
  sentences: number;
  sentenceLength: ReturnType<typeof lengthStats>;
  emDashPer1k: number;
  enDashPer1k: number;
  exclamationPer1k: number;
  tricolon: number;
  notBut: number;
  parallelOpenerRuns: number;
  participialTail: number;
  wordlist: { ratePer1k: number; hits: { term: string; count: number }[] };
  hedgesPer1k: number;
  intensifiersPer1k: number;
  summaryCloser: boolean;
}

export function scanTells(raw: string): TellScan {
  const text = stripMarkdown(raw.replace(/(?<=\w)[ʼʹ´‘’′](?=\w)/g, "'"));
  const n = words(text).length;
  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);
  const emDashes = (text.match(/—/g)?.length ?? 0) + (text.match(/(?<=\w)--(?=\w)|(?<=\s)--(?=\s)/g)?.length ?? 0);
  const wordlistHits = phraseHits(sentences, AI_WORDLIST);
  const rate = (hits: { count: number }[]) => per1k(hits.reduce((a, h) => a + h.count, 0), n);
  return {
    words: n,
    sentences: sentences.length,
    sentenceLength: lengthStats(sentences.map((s) => words(s).length)),
    emDashPer1k: per1k(emDashes, n),
    enDashPer1k: per1k(text.match(/–/g)?.length ?? 0, n),
    exclamationPer1k: per1k(text.match(/!/g)?.length ?? 0, n),
    tricolon: text.match(TRICOLON_RE)?.length ?? 0,
    notBut: countNotBut(text),
    parallelOpenerRuns: parallelOpenerRuns(sentences),
    participialTail: participialTails(sentences),
    wordlist: { ratePer1k: rate(wordlistHits), hits: wordlistHits },
    hedgesPer1k: rate(phraseHits(sentences, HEDGES)),
    intensifiersPer1k: rate(phraseHits(sentences, INTENSIFIERS)),
    summaryCloser: summaryCloser(paragraphs),
  };
}
