// Punctuation gaps (Q5, Cam 15 Oct: casual messages still need decent punctuation). Counts, per 100
// words: sentences that start with a small letter, a small "i" (alone or in i'm, i've), and lines of three or more words
// that end with no punctuation at all. Short lines (a name, "Cheers") are sign-offs, so they are skipped.
// Development measure only; lower is better.
const WORDS = /[A-Za-z0-9£$€]+(?:['’][A-Za-z]+)?/g;
const END = /[.!?:;,)"'’”…]$/;

export function punctuationGaps(text: string): number {
  const words = text.match(WORDS)?.length ?? 0;
  if (words === 0) return 0;
  let gaps = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/^[-*•]\s+/, "");
    if (!line || /^https?:\/\//.test(line)) continue;
    // A sentence starts at the line start or after . ! ? and a space; a small letter there is a gap.
    for (const start of line.matchAll(/(?:^|[.!?]\s+)([a-z])/g)) if (start[1]) gaps++;
    gaps += line.match(/(?<![A-Za-z'’])i(?![A-Za-z.])/g)?.length ?? 0;
    if ((line.match(WORDS)?.length ?? 0) >= 3 && !END.test(line)) gaps++;
  }
  return (gaps / words) * 100;
}
