"use server";

import { refresh } from "next/cache";
import { isLaunched } from "@/config/site";
import { adminCopy } from "@/content/admin";
import { canStart, isAdmin } from "@/lib/admin";
import { isSide, setNameFrom } from "@/lib/blind";
import { saveChoice } from "@/lib/server/blind";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { currentUser } from "@/lib/supabase/server";

export type StartState = { message: string };

/** Starts the one and only kill-test run. The database refuses a second run as well. */
export async function startKillTest(_previous: StartState, form: FormData): Promise<StartState> {
  const copy = adminCopy.start;
  const user = await currentUser();
  if (!user || !isAdmin(user.email)) return { message: copy.notAllowed };

  const db = supabaseAdmin();
  const { count, error: countError } = await db.from("kill_test_runs").select("id", { count: "exact", head: true });
  if (countError) return { message: copy.failed };
  // The demo never runs Stripe live, so a new kill test can never start (it ran 19 to 29 Oct 2026).
  const liveStripe = false;
  const check = canStart({ launched: isLaunched(), liveStripe, confirmed: form.get("confirm") === "yes", alreadyStarted: (count ?? 0) > 0 });
  if (!check.ok) return { message: copy[check.reason] };

  const { error } = await db.from("kill_test_runs").insert({ started_by: user.email });
  if (error) {
    // 23505: the unique singleton column, meaning another run already exists.
    if (error.code === "23505") return { message: copy.alreadyStarted };
    console.error("kill test start failed", error.code);
    return { message: copy.failed };
  }
  refresh();
  return { message: "" };
}

export type JudgeState = { message: string };

/** Records which version of a blind pair Cam would send. Each pair can be judged once. */
export async function judgePair(_previous: JudgeState, form: FormData): Promise<JudgeState> {
  const copy = adminCopy.blind;
  const user = await currentUser();
  if (!user || !isAdmin(user.email)) return { message: copy.notAllowed };

  const id = Number(form.get("id"));
  const winner = form.get("winner");
  if (!Number.isSafeInteger(id) || id <= 0 || !isSide(winner)) return { message: copy.failed };
  if (!(await saveChoice(setNameFrom(form.get("set")), id, winner))) return { message: copy.failed };
  refresh();
  return { message: "" };
}
