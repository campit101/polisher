// The blind comparison (T9): Cam judges pairs of rewrites without knowing which is Polisher.
// Pure functions only, so the counting and the verdict are unit tested.
// Relative import with the extension, so npm run blind:build (plain Node) can use this file too.
import { killTest } from "../config/kill-test.ts";

export type BlindSource = "polisher" | "baseline";
export type Side = "a" | "b";
export type BlindVerdict = "pass" | "stop" | "write_why" | "in_progress";

/** The real 20 pairs. Browser tests use their own set names in the same table. */
export const KILL_TEST_SET = "kill-test";

/** A set name from the address bar, or the real set when it is missing or not a valid name. */
export function setNameFrom(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9-]{1,64}$/.test(value) ? value : KILL_TEST_SET;
}

export function isSide(value: unknown): value is Side {
  return value === "a" || value === "b";
}

/** Places the two texts as A and B. coin decides the order, so neither side is always Polisher. */
export function arrange(polisher: string, baseline: string, coin: boolean) {
  return coin
    ? { text_a: polisher, source_a: "polisher" as const, text_b: baseline, source_b: "baseline" as const }
    : { text_a: baseline, source_a: "baseline" as const, text_b: polisher, source_b: "polisher" as const };
}

export type JudgedRow = { source_a: BlindSource; source_b: BlindSource; winner: Side | null };

/** The source of the text Cam picked, or null while the pair is not judged. */
export function chosenSource(row: JudgedRow): BlindSource | null {
  if (row.winner === "a") return row.source_a;
  if (row.winner === "b") return row.source_b;
  return null;
}

export function tally(rows: JudgedRow[]) {
  const judged = rows.filter((r) => r.winner !== null);
  return { total: rows.length, judged: judged.length, polisherWins: judged.filter((r) => chosenSource(r) === "polisher").length };
}

/** Locked rule: 14 or more of 20 is a pass, 10 or fewer is a stop, 11 to 13 needs a written reason. */
export function blindVerdict(polisherWins: number, judged: number): BlindVerdict {
  if (judged < killTest.blind.pairs) return "in_progress";
  if (polisherWins >= killTest.blind.passWinsAtLeast) return "pass";
  if (polisherWins <= killTest.blind.stopWinsAtMost) return "stop";
  return "write_why";
}

/**
 * Blind comparison 2 (launch decision 1, Cam, 16 Oct): Claude Haiku 5.5, Polisher's model today, in
 * the "polisher" slot, against Claude Sonnet 5.5 in the "baseline" slot, both through the same pipeline.
 * Browser tests use their own copies of the set, named model-compare-<something>.
 */
export const MODEL_COMPARE_SET = "model-compare";
export const isModelCompareSet = (setName: string) => setName === MODEL_COMPARE_SET || setName.startsWith(`${MODEL_COMPARE_SET}-`);

export type ModelVerdict = "switch" | "keep" | "in_progress";

/** Sonnet's picks among the judged pairs. */
export function sonnetWins(rows: JudgedRow[]): number {
  return rows.filter((r) => chosenSource(r) === "baseline").length;
}

/**
 * Cam's rule: switch only if Sonnet is preferred in at least 14 of 20 (the locked pass mark), with no
 * critical meaning changes and an affordable cost, both checked outside this page.
 */
export function modelVerdict(wins: number, judged: number): ModelVerdict {
  if (judged < killTest.blind.pairs) return "in_progress";
  return wins >= killTest.blind.passWinsAtLeast ? "switch" : "keep";
}
