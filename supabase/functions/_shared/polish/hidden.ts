// Removes characters nobody can see and leftovers from copying out of chat apps. The character
// tables follow BeMoreDifferent/ai-text-sanitizer (MIT, Copyright (c) BeMoreDifferent,
// https://github.com/BeMoreDifferent/ai-text-sanitizer at a5791d0, src/tables/unicode.ts).
// This cannot remove a statistical watermark (one hidden in word choice), and Polisher never claims it does.

const range = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => start + i);

/** Zero-width, direction and format characters, soft hyphens and other default-ignorable code points. */
const INVISIBLE = new Set<number>([
  0x00ad, 0x034f, 0x061c, 0x115f, 0x1160, 0x17b4, 0x17b5, ...range(0x180b, 0x180f), 0x200b, 0x200c, 0x200d, 0x200e, 0x200f,
  ...range(0x202a, 0x202e), ...range(0x2060, 0x206f), 0x3164, 0xfeff, 0xffa0, ...range(0xfff0, 0xfff8), ...range(0x1bca0, 0x1bca3),
  ...range(0x1d173, 0x1d17a),
]);
/** Joiners and selectors that are part of an emoji when they sit next to one. */
const EMOJI_GLUE = new Set<number>([0x200d, ...range(0xfe00, 0xfe0f)]);
const UNUSUAL_SPACES = new Set<number>([0x00a0, 0x1680, ...range(0x2000, 0x200a), 0x202f, 0x205f, 0x3000]);

const isTag = (cp: number) => cp >= 0xe0000 && cp <= 0xe007f;
const isSupplementarySelector = (cp: number) => cp >= 0xe0100 && cp <= 0xe01ef;
const isPrivateUse = (cp: number) => (cp >= 0xe000 && cp <= 0xf8ff) || (cp >= 0xf0000 && cp <= 0x10fffd);
const isControl = (cp: number) => (cp <= 0x1f && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) || (cp >= 0x7f && cp <= 0x9f);
const isEmoji = (char: string | undefined) => !!char && /\p{Extended_Pictographic}/u.test(char);

// ChatGPT copy-and-paste leftovers: ":contentReference[oaicite:0]{index=0}", "(oaicite:0){index=0}",
// "【4:0†source】", and source envelopes wrapped in private-use characters (U+E200 ... U+E201).
// Each alternative starts with literal text, so matching is linear; the spaces before a marker are
// trimmed separately (a leading " *" in the pattern backtracked quadratically on long space runs).
const MARKERS = /(?::contentReference)?[[(]oaicite:\d+[\])]\{index=\d+\}|【\d+(?::\d+)?†[^】]*】|\uE200[A-Za-z-]+(?:\uE202[^\uE200\uE201]*)+\uE201/g;

export interface HiddenResult {
  text: string;
  /** Invisible or unusual characters removed or replaced with an ordinary space. */
  hidden: number;
  /** Chat-app citation leftovers removed. */
  markers: number;
}

function trimTrailingSpaces(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === " ") end--;
  return text.slice(0, end);
}

export function stripHidden(input: string): HiddenResult {
  let markers = 0;
  let unmarked = "";
  let from = 0;
  for (const match of input.matchAll(MARKERS)) {
    markers++;
    unmarked += trimTrailingSpaces(input.slice(from, match.index));
    from = match.index + match[0].length;
  }
  unmarked += input.slice(from);
  const chars = Array.from(unmarked);
  let hidden = 0;
  const kept: string[] = [];
  chars.forEach((char, i) => {
    const cp = char.codePointAt(0)!;
    if (UNUSUAL_SPACES.has(cp)) {
      hidden++;
      kept.push(" ");
      return;
    }
    if (EMOJI_GLUE.has(cp) && (isEmoji(chars[i - 1]) || isEmoji(chars[i + 1]))) {
      kept.push(char);
      return;
    }
    if (INVISIBLE.has(cp) || EMOJI_GLUE.has(cp) || isTag(cp) || isSupplementarySelector(cp) || isPrivateUse(cp) || isControl(cp)) {
      hidden++;
      return;
    }
    kept.push(char);
  });
  return hidden + markers === 0 ? { text: input, hidden: 0, markers: 0 } : { text: kept.join(""), hidden, markers };
}
