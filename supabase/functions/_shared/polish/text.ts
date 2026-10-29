// Small text helpers shared by the polish passes. No dependencies, runs on Deno and Node.

/** Marks a cut that started a sentence, so the next letter can be capitalised afterwards. */
export const CAPITALISE_MARK = "\uE002";

/** True when `offset` sits at the start of the text, a line or a sentence (ignoring opening quotes and brackets). */
export function isSentenceStart(text: string, offset: number): boolean {
  const from = Math.max(0, offset - 12);
  const window = (from === 0 ? "\n" : "") + text.slice(from, offset);
  return /(?:[.!?]["'”’)\]]*\s|\n)[\s"'“‘(\[\uE002]*$/u.test(window);
}

/** Copies the case pattern of `original` (ALL CAPS or Capitalised) onto `replacement`. */
export function matchCase(original: string, replacement: string): string {
  if (replacement === "") return replacement;
  const letters = original.replace(/[^\p{L}]/gu, "");
  if (letters.length > 1 && letters === letters.toUpperCase()) return replacement.toUpperCase();
  const first = original.charAt(0);
  if (first !== first.toLowerCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

/** Capitalises the first letter after each CAPITALISE_MARK and removes the marks. */
export function applyCapitaliseMarks(text: string): string {
  return text
    .replace(/\uE002([^\p{L}\p{N}]*)(\p{L})/gu, (_m, gap: string, letter: string) => gap + letter.toUpperCase())
    .replaceAll(CAPITALISE_MARK, "");
}

/** Repairs spacing and punctuation left behind after words are cut. Only run when a pass changed something. */
export function tidy(text: string): string {
  return text
    .replace(/,(?=[ \t]*[.,;:!?])/g, "")
    .replace(/[ \t]+(?=[.,;:!?)\]])/g, "")
    .replace(/(?<=\S)[ \t]{2,}(?=\S)/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}
