// Reads the blind comparison for /admin/blind. Server only: uses the secret key.
// While pairs are left to judge, only the next pair's texts are read, never which side is Polisher.
import { blindVerdict, chosenSource, sonnetWins, tally, type BlindSource, type BlindVerdict, type Side } from "@/lib/blind";
import { supabaseAdmin } from "./supabase-admin";

export type NextPair = { id: number; number: number; textA: string; textB: string };
export type Choice = { number: number; draftId: string | null; chose: BlindSource };

export type BlindPage =
  | { state: "empty" }
  | { state: "judging"; total: number; judged: number; next: NextPair }
  | { state: "done"; total: number; polisherWins: number; baselineWins: number; verdict: BlindVerdict; choices: Choice[] };

export async function loadBlind(setName: string): Promise<BlindPage> {
  const db = supabaseAdmin();
  // Judged state only: the texts and sources are not read here.
  const { data: rows, error } = await db.from("blind_pairs").select("id, winner").eq("set_name", setName).order("id");
  if (error) throw new Error(error.message);
  if (!rows?.length) return { state: "empty" };

  const index = rows.findIndex((r) => r.winner === null);
  if (index >= 0) {
    const { data: pair, error: pairError } = await db.from("blind_pairs").select("id, text_a, text_b").eq("id", rows[index]!.id).single();
    if (pairError) throw new Error(pairError.message);
    return {
      state: "judging",
      total: rows.length,
      judged: rows.filter((r) => r.winner !== null).length,
      next: { id: pair.id, number: index + 1, textA: pair.text_a, textB: pair.text_b },
    };
  }

  const { data: judged, error: judgedError } = await db
    .from("blind_pairs")
    .select("draft_id, source_a, source_b, winner")
    .eq("set_name", setName)
    .order("id");
  if (judgedError) throw new Error(judgedError.message);
  const typed = judged as { draft_id: string | null; source_a: BlindSource; source_b: BlindSource; winner: Side }[];
  const counts = tally(typed);
  return {
    state: "done",
    total: counts.total,
    polisherWins: counts.polisherWins,
    // In blind comparison 2 the "baseline" slot is Sonnet.
    baselineWins: sonnetWins(typed),
    verdict: blindVerdict(counts.polisherWins, counts.judged),
    choices: typed.map((r, i) => ({ number: i + 1, draftId: r.draft_id, chose: chosenSource(r)! })),
  };
}

/** Saves a choice once. A pair that is already judged is left as it was. */
export async function saveChoice(setName: string, id: number, winner: Side): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .from("blind_pairs")
    .update({ winner, judged_at: new Date().toISOString() })
    .eq("id", id)
    .eq("set_name", setName)
    .is("winner", null);
  if (error) console.error("blind choice failed", error.code);
  return !error;
}
