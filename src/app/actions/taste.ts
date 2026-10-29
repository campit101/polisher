"use server";

// The free taste on the front page (R1): one full rewrite without an account, from the visitor's own
// answers to the questions (kept in their browser), behind a bot check, once per browser (a signed
// cookie) and at most twice a day per connection.
import { site } from "@/config/site";
import { cookies } from "next/headers";
import { type Challenge, createChallenge, verifySolution } from "@/lib/pow";
import { isTasteCookie, makeTasteCookie, TASTE_COOKIE, TASTE_COOKIE_MAX_AGE } from "@/lib/taste-cookie";
import { requireEnv } from "@/lib/server/env";
import { callTasteFunction, type FunctionError, type TasteResult } from "@/lib/server/rewrite";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { visitorHash, withinRateLimit } from "@/lib/server/visitor";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { countWords } from "@/lib/words";
import { isKind } from "../../../supabase/functions/_shared/rewrite/kinds.ts";

export type TasteState = TasteResult | FunctionError | { status: "error"; reason: "bot_check" | "taste_used" } | { status: "idle" };

/** A fresh, signed bot-check challenge for the browser to solve. */
export async function getTasteChallenge(): Promise<Challenge | null> {
  if (!(await withinRateLimit(`pow-issue:${await visitorHash()}`, 3600, 30))) return null;
  return createChallenge(requireEnv("IP_HASH_SALT"));
}

const parseJson = (value: FormDataEntryValue | null): unknown => {
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    return null;
  }
};

export async function tasteRewrite(_previous: TasteState, form: FormData): Promise<TasteState> {
  const draft = String(form.get("draft") ?? "");
  const chosen = form.get("kind");
  const kind = isKind(chosen) ? chosen : undefined;
  // American spelling only when chosen in Settings (Cam, 16 Oct).
  const spelling = form.get("spelling") === "us" ? { spelling: "us" as const } : {};
  const answers = parseJson(form.get("answers"));
  if (countWords(draft) === 0) return { status: "error", reason: "empty" };
  if (countWords(draft) > site.draftMaxWords || draft.length > site.draftMaxChars) return { status: "error", reason: "too_long" };
  if (!Array.isArray(answers) || !answers.every((a) => typeof a === "string")) return { status: "needs_samples" };
  // One free try per browser (Cam, 16 Oct): this browser's signed cookie says it has had it.
  const jar = await cookies();
  if (isTasteCookie(requireEnv("IP_HASH_SALT"), jar.get(TASTE_COOKIE)?.value)) return { status: "error", reason: "taste_used" };

  // The bot check: a solved, signed, unexpired challenge, used only once.
  const challenge = parseJson(form.get("challenge")) as Challenge;
  const nonce = String(form.get("nonce") ?? "");
  if (!verifySolution(requireEnv("IP_HASH_SALT"), challenge, nonce)) return { status: "error", reason: "bot_check" };
  if (!(await withinRateLimit(`pow:${challenge.salt}`, 3600, 1))) return { status: "error", reason: "bot_check" };
  // A backstop per connection: two tries a day, so a failed first try can be repeated and people
  // sharing one network (a college) are not all stopped by one person; the cookie is the real limit.
  if (!(await withinRateLimit(`taste-ip:${await visitorHash()}`, 86_400, 2))) return { status: "error", reason: "taste_used" };

  const result = await callTasteFunction({ action: "taste", draft, mode: "draft", samples: answers.filter((a) => a.trim()).slice(0, 5), ...(kind ? { kind } : {}), ...spelling });
  if (result.status === "ok") {
    jar.set(TASTE_COOKIE, makeTasteCookie(requireEnv("IP_HASH_SALT")), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: TASTE_COOKIE_MAX_AGE });
  }
  return result;
}

export type CarryState = { saved: number } | null;

/**
 * After signing in following a taste: the answers become writing samples (as much room as the account
 * has), the account's first free rewrite counts as used (the taste was it, so one more is shown and the
 * third is locked: launch decision 3), and taste_to_signup is logged once.
 */
export async function saveTasteAnswers(answers: string[]): Promise<CarryState> {
  const user = await currentUser();
  if (!user || !Array.isArray(answers)) return null;
  const clean = answers
    .filter((a): a is string => typeof a === "string")
    .map((a) => a.trim())
    .filter((a) => countWords(a) > 0 && countWords(a) <= site.samples.maxWordsEach && a.length <= site.samples.maxCharsEach)
    .slice(0, site.samples.max);
  const supabase = await supabaseServer();
  const { count } = await supabase.from("writing_samples").select("id", { count: "exact", head: true });
  const room = Math.max(0, site.samples.max - (count ?? 0));
  const toSave = clean.slice(0, room);
  // One at a time, so each gets its own time and they stay in the order they were answered.
  for (const body of toSave) {
    const { error } = await supabase.from("writing_samples").insert({ body });
    if (error) console.error("taste answers save failed", error.code);
  }
  const db = supabaseAdmin();
  const { data: profile } = await db.from("profiles").select("free_rewrites_used").eq("id", user.id).maybeSingle();
  if ((profile?.free_rewrites_used ?? 0) < 1) await db.from("profiles").update({ free_rewrites_used: 1 }).eq("id", user.id);
  await db.from("events").insert({ name: "taste_to_signup", path: "/app" });
  return { saved: toSave.length };
}
