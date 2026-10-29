// British to American spelling, for people who choose American English in Settings (Cam, 16 Oct).
// The British list reversed, minus words American English also uses, plus a fixed list of common
// -ise and -yse words. There is no general -ise rule, because advertise, exercise, surprise and many
// more end in -ise in American English too.
import { convertSpelling, US_TO_UK, type UkSpellingResult } from "./uk-spelling.ts";

// Thru is informal; the -ogue words, glamour and doughnut are normal American spellings too.
const KEEP = new Set(["through", "dialogue", "dialogues", "monologue", "monologues", "prologue", "epilogue", "glamour", "doughnut", "doughnuts"]);

const pairs: [string, string][] = [];
const seen = new Set<string>();
for (const [us, uk] of US_TO_UK) {
  if (KEEP.has(uk) || seen.has(uk)) continue;
  seen.add(uk);
  pairs.push([uk, us]);
}

// Common words that end in -ise or -yse in British English and -ize or -yze in American English.
const ISE_ROOTS = `
  agon apolog author capital categor central character civil colon commercial computer critic custom
  democrat digit dramat econom emphas energ familiar fantas fertil final formal general global harmon
  hospital human hypnot ideal immun item jeopard legal legitim local maxim memor minim mobil modern
  monopol neutral normal optim organ ostrac patron penal personal polar popular pressur priorit public
  rational real recogn revolution scrutin social special stabil standard stigmat subsid summar symbol
  sympath synchron terror theor trivial util vandal visual vocal western urban
  desensit decentral disorgan reorgan unorgan unreal unrecogn
`;
const ISE_ENDINGS = ["e", "es", "ed", "er", "ers", "ing", "ation", "ations", "able"];
for (const root of ISE_ROOTS.trim().split(/\s+/)) {
  for (const ending of ISE_ENDINGS) pairs.push([`${root}is${ending}`, `${root}iz${ending}`]);
}
for (const root of ["analy", "paraly", "cataly", "breathaly"]) {
  for (const ending of ["e", "es", "ed", "er", "ers", "ing"]) pairs.push([`${root}s${ending}`, `${root}z${ending}`]);
}

export const UK_TO_US: ReadonlyMap<string, string> = new Map(pairs);

export function toUsSpelling(input: string): UkSpellingResult {
  return convertSpelling(input, (word) => UK_TO_US.get(word));
}
