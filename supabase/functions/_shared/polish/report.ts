// The change report shown beside each rewrite.

export interface PhraseHit {
  phrase: string;
  count: number;
}

export interface SpellingChange {
  from: string;
  to: string;
  count: number;
}

export interface PolishReport {
  dashesReplaced: number;
  phrasesChanged: PhraseHit[];
  spellingsChanged: SpellingChange[];
  /** Quoted passages left exactly as written. Not a change, so not in totalChanges. */
  quotationsKept: number;
  /** Invisible or unusual characters removed (or turned into ordinary spaces). */
  hiddenRemoved: number;
  /** Chat-app citation leftovers such as :contentReference[oaicite:0]{index=0}. */
  markersRemoved: number;
  totalChanges: number;
  /** Set only when the person chose American spelling; British otherwise. */
  spellingTo?: "us";
}

const sum = (items: { count: number }[]) => items.reduce((total, item) => total + item.count, 0);

export function buildReport(
  dashes: number,
  phrases: PhraseHit[],
  spellings: SpellingChange[],
  quotationsKept = 0,
  removed: { hidden: number; markers: number } = { hidden: 0, markers: 0 },
  spelling: "uk" | "us" = "uk",
): PolishReport {
  return {
    ...(spelling === "us" ? { spellingTo: "us" as const } : {}),
    dashesReplaced: dashes,
    phrasesChanged: phrases,
    spellingsChanged: spellings,
    quotationsKept,
    hiddenRemoved: removed.hidden,
    markersRemoved: removed.markers,
    totalChanges: dashes + sum(phrases) + sum(spellings) + removed.hidden + removed.markers,
  };
}

/** Adds what was removed from the user's draft before the AI saw it. */
export function addRemoved(report: PolishReport, removed: { hidden: number; markers: number }): PolishReport {
  return {
    ...report,
    hiddenRemoved: report.hiddenRemoved + removed.hidden,
    markersRemoved: report.markersRemoved + removed.markers,
    totalChanges: report.totalChanges + removed.hidden + removed.markers,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Plain-English lines for the report: one per kind of change, then any quotations left alone. */
export function summariseReport(report: PolishReport): string[] {
  const lines = report.totalChanges === 0 ? ["No changes needed."] : summariseChanges(report);
  if (report.quotationsKept > 0) lines.push(`${plural(report.quotationsKept, "quotation", "quotations")} left exactly as written`);
  return lines;
}

/** One line per kind of change. Empty when nothing changed. */
export function summariseChanges(report: PolishReport): string[] {
  const lines: string[] = [];
  const phrases = sum(report.phrasesChanged);
  const spellings = sum(report.spellingsChanged);
  if (report.dashesReplaced > 0) lines.push(`${plural(report.dashesReplaced, "dash", "dashes")} replaced`);
  if (phrases > 0) lines.push(`${plural(phrases, "stock phrase", "stock phrases")} removed or reworded`);
  if (spellings > 0) lines.push(`${plural(spellings, "word", "words")} changed to ${report.spellingTo === "us" ? "American" : "UK"} spelling`);
  if (report.hiddenRemoved > 0) lines.push(`${plural(report.hiddenRemoved, "hidden character", "hidden characters")} removed`);
  if (report.markersRemoved > 0) lines.push(`${plural(report.markersRemoved, "chat citation marker", "chat citation markers")} removed`);
  return lines;
}
