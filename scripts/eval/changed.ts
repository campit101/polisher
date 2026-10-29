// "Changed" measure for the quality loop (Q3, development only): the share of the draft's distinct
// three-word runs that are still in the rewrite. 1 means the wording was kept, 0 means none of it
// survived. Lower means more rewritten; meaning is checked separately, so a low number alone is not a win.

const words = (text: string) => text.toLowerCase().replace(/’/g, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}]+)*/gu) ?? [];

function trigrams(text: string): Set<string> {
  const ws = words(text);
  const out = new Set<string>();
  for (let i = 0; i + 2 < ws.length; i++) out.add(`${ws[i]} ${ws[i + 1]} ${ws[i + 2]}`);
  return out;
}

export function trigramSurvival(draft: string, rewrite: string): number {
  const before = trigrams(draft);
  if (before.size === 0) return 0;
  const after = trigrams(rewrite);
  let kept = 0;
  for (const t of before) if (after.has(t)) kept++;
  return kept / before.size;
}
