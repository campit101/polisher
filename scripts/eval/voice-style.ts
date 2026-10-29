// Voice match for the quality loop (development only). A Burrows' Delta style distance: how far a
// text's habits (common little words, punctuation, contractions, sentence and word length) sit from
// one person's reference writing, each habit measured in standard deviations of a fixed corpus.
// Lower is closer. It ignores topic words on purpose, so it measures how someone writes, not what
// about. A rough proxy: on short texts it is noisy, so only averages over many texts mean anything.

// Common English function words (Burrows and later stylometry work use lists like this).
export const FUNCTION_WORDS = [
  "the", "a", "an", "and", "but", "or", "so", "if", "then", "because", "that", "this", "it", "i", "you",
  "we", "they", "he", "she", "me", "my", "your", "our", "is", "was", "are", "be", "been", "have", "has",
  "had", "do", "did", "will", "would", "can", "could", "should", "just", "not", "no", "to", "of", "in",
  "on", "for", "with", "at", "about", "from", "as", "by", "up", "out", "all", "what", "when", "how",
  "really", "very", "too", "also", "still", "now", "like", "think", "know", "get", "got",
] as const;

const words = (text: string) => text.toLowerCase().match(/[a-z]+(?:['’][a-z]+)*/g) ?? [];
const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[a-z]/i.test(s));
const per100 = (count: number, n: number) => (n ? (100 * count) / n : 0);
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

export type Features = Record<string, number>;

export function features(text: string): Features {
  const ws = words(text);
  const n = ws.length;
  const ss = sentences(text);
  const lengths = ss.map((s) => words(s).length).filter((l) => l > 0);
  const meanLen = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const out: Features = {};
  const freq = new Map<string, number>();
  for (const w of ws) {
    const base = w.replace(/['’].*$/, "");
    freq.set(base, (freq.get(base) ?? 0) + 1);
  }
  for (const fw of FUNCTION_WORDS) out[`w:${fw}`] = per100(freq.get(fw) ?? 0, n);
  out["contractions"] = per100(ws.filter((w) => /['’]/.test(w)).length, n);
  out["commas"] = per100(count(text, /,/g), n);
  out["full stops"] = per100(count(text, /\.(?!\.)/g), n);
  out["exclamations"] = per100(count(text, /!/g), n);
  out["questions"] = per100(count(text, /\?/g), n);
  out["semicolons and colons"] = per100(count(text, /[;:](?!\/\/)/g), n);
  out["dashes"] = per100(count(text, /[—–]| - /g), n);
  out["brackets"] = per100(count(text, /\(/g), n);
  out["ellipses"] = per100(count(text, /\.\.\.|…/g), n);
  out["emoji"] = per100(count(text, /\p{Extended_Pictographic}/gu), n);
  out["lower-case i"] = per100(count(text, /(^|[^\p{L}'’])i(?=[\s'’,.!?]|$)/gu), n);
  out["lower-case starts"] = ss.length ? (100 * ss.filter((s) => /^[a-z]/.test(s)).length) / ss.length : 0;
  out["sentence length"] = meanLen;
  out["word length"] = n ? ws.reduce((a, w) => a + w.length, 0) / n : 0;
  return out;
}

export type Norm = { mean: Features; sd: Features };

// One unusual habit in a short text can sit far out; capping it keeps one word from deciding the score.
const MAX_Z = 3;

/** Corpus means and standard deviations for each habit, fixed once per evaluation set. */
export function normFrom(texts: string[]): Norm {
  const all = texts.map(features);
  const keys = Object.keys(all[0] ?? {});
  const mean: Features = {};
  const sd: Features = {};
  for (const k of keys) {
    const values = all.map((f) => f[k] ?? 0);
    const m = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, values.length - 1);
    mean[k] = m;
    // A floor stops a habit almost nobody in the corpus shows from dominating the distance.
    sd[k] = Math.max(Math.sqrt(variance), 0.5);
  }
  return { mean, sd };
}

/** One person's average habits over their reference texts. */
export function profileFrom(texts: string[]): Features {
  const all = texts.map(features);
  const out: Features = {};
  for (const k of Object.keys(all[0] ?? {})) out[k] = all.reduce((a, f) => a + (f[k] ?? 0), 0) / all.length;
  return out;
}

/**
 * Mean distance in standard deviations between a text's habits and a profile. Lower is closer.
 * Function words and the other habits each count for half: on short texts the 70 word counts are
 * noisy and would otherwise drown out punctuation, contractions and sentence length.
 */
export function voiceDelta(text: string, profile: Features, norm: Norm): number {
  const f = features(text);
  const distance = (keys: string[]) =>
    keys.reduce((sum, k) => sum + Math.min(MAX_Z, Math.abs(((f[k] ?? 0) - (profile[k] ?? 0)) / (norm.sd[k] ?? 1))), 0) / keys.length;
  const keys = Object.keys(norm.sd);
  return (distance(keys.filter((k) => k.startsWith("w:"))) + distance(keys.filter((k) => !k.startsWith("w:")))) / 2;
}
