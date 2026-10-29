// Deterministic post-processor run on every rewrite: hidden characters, dashes, stock phrases, then British
// spelling (or American, when chosen). Links, email addresses, code and quotations are protected so they come back untouched.
import { fixDashes } from "./dashes.ts";
import { stripHidden } from "./hidden.ts";
import { buildReport, type PolishReport, summariseChanges } from "./report.ts";
import { stripStockPhrases } from "./stock-phrases.ts";
import { toUkSpelling } from "./uk-spelling.ts";
import { toUsSpelling } from "./us-spelling.ts";

/** British by default; American when the person chooses it in Settings (Cam, 16 Oct). */
export type Spelling = "uk" | "us";

export type { PolishReport } from "./report.ts";
export { addRemoved, summariseReport } from "./report.ts";
export { stripHidden } from "./hidden.ts";

export interface PolishResult {
  text: string;
  report: PolishReport;
}

const PROTECTED = /```[\s\S]*?```|`[^`\n]*`|https?:\/\/[^\s<>"]+|www\.[^\s<>"]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

// A quotation is someone's exact words, so it is never changed. It ends at its closing mark and never
// runs over a blank line, so a lone inch mark (a 5" pipe) cannot protect the rest of the text.
const QUOTATION = /"[^"\n]*(?:\n(?!\n)[^"\n]*)*"|“[^“”\n]*(?:\n(?!\n)[^“”\n]*)*”/g;

function protect(input: string): { text: string; restore: (text: string) => string; quotations: number } {
  const saved: string[] = [];
  let quotations = 0;
  const quoted = input.replace(QUOTATION, (match: string) => {
    quotations++;
    saved.push(match);
    return `\uE000${saved.length - 1}\uE001`;
  });
  const text = quoted.replace(PROTECTED, (match: string) => {
    // A full stop or bracket straight after a link belongs to the sentence, not the link.
    const trailing = /^(?:https?:\/\/|www\.)/.test(match) ? (/[.,;:!?)\]]+$/.exec(match)?.[0] ?? "") : "";
    saved.push(match.slice(0, match.length - trailing.length));
    return `\uE000${saved.length - 1}\uE001${trailing}`;
  });
  const restore = (masked: string) =>
    masked.replace(/\uE000(\d+)\uE001/g, (_m, index: string) => saved[Number(index)] ?? "");
  return { text, restore, quotations };
}

export function polish(input: string, spelling: Spelling = "uk"): PolishResult {
  // Hidden characters go first, so a private-use character in the input can never clash with the markers below.
  const hidden = stripHidden(input);
  const { text, restore, quotations } = protect(hidden.text);
  const dashes = fixDashes(text);
  const phrases = stripStockPhrases(dashes.text);
  const spelled = spelling === "us" ? toUsSpelling(phrases.text) : toUkSpelling(phrases.text);
  return {
    text: restore(spelled.text),
    report: buildReport(dashes.count, phrases.hits, spelled.changes, quotations, hidden, spelling),
  };
}

/** Lists the AI tells polish() would fix. Empty when the text is clean (used to check site copy). */
export function findTells(text: string): string[] {
  const { report } = polish(text);
  return report.totalChanges === 0 ? [] : summariseChanges(report);
}
