// Removes em dashes, en dashes and the horizontal bar, the commonest visual tell of AI-written text.
import { tidy } from "./text.ts";

export interface DashResult {
  text: string;
  count: number;
}

export function fixDashes(input: string): DashResult {
  let count = 0;
  const counted = (replacement: string) => {
    count++;
    return replacement;
  };

  let text = input
    // A spaced double hyphen is a typed em dash; flags such as --force have no space after.
    .replace(/(?<=\S)[ \t]+--[ \t]+(?=\S)/g, " — ")
    // Dash bullets become hyphen bullets.
    .replace(/^([ \t]*)[—–―][ \t]+/gm, (_m, indent: string) => counted(`${indent}- `))
    // Number ranges read as words, as the plan sets: 9 to 5, £5 to £10, 9am to 5pm.
    .replace(/(\d(?:%|[ap]m)?)[ \t]*[—–―]+[ \t]*(?=[£$€]?\d)/gi, (_m, start: string) => counted(`${start} to `));

  text = text.replace(/[ \t]*[—–―]+[ \t]*/g, (match: string, offset: number, whole: string) => {
    const before = whole[offset - 1];
    const after = whole[offset + match.length];
    if (before === undefined || before === "\n") return counted("");
    if (after === undefined || after === "\n" || /[.,;:!?)\]"'”’]/.test(after)) return counted("");
    if (/[.,;:!?(\[]/.test(before)) return counted(" ");
    return counted(", ");
  });

  return { text: count > 0 ? tidy(text) : text, count };
}
