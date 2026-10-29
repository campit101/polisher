"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import { appCopy } from "@/content/app";
import { countWords } from "@/lib/words";
import { isKind } from "../../../supabase/functions/_shared/rewrite/kinds.ts";
import { callRewriteFunction, type FunctionError, type Mode, type RewriteResult, type UnlockResult } from "@/lib/server/rewrite";
import { visitorHash, withinRateLimit } from "@/lib/server/visitor";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

export type SampleState = { status: "idle" | "ok" | "error"; message: string };

const error = (message: string): SampleState => ({ status: "error", message });

async function signedIn() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/app");
  return user;
}

function checkSample(body: string): string | null {
  if (countWords(body) === 0) return appCopy.samples.empty;
  // The character cap matches the database's own check, so an over-long sample never reaches it.
  if (countWords(body) > site.samples.maxWordsEach || body.length > site.samples.maxCharsEach) return appCopy.samples.tooLong;
  return null;
}

/** Adds a sample as the user (Row Level Security applies; the database allows at most 5). */
export async function addSample(_previous: SampleState, form: FormData): Promise<SampleState> {
  await signedIn();
  const body = String(form.get("body") ?? "").trim();
  const problem = checkSample(body);
  if (problem) return error(problem);
  const supabase = await supabaseServer();
  const { error: failed } = await supabase.from("writing_samples").insert({ body });
  if (failed) return error(failed.code === "P0001" ? appCopy.samples.full : appCopy.samples.failed);
  refresh();
  return { status: "ok", message: "" };
}

export async function updateSample(_previous: SampleState, form: FormData): Promise<SampleState> {
  await signedIn();
  const id = String(form.get("id") ?? "");
  const body = String(form.get("body") ?? "").trim();
  const problem = checkSample(body);
  if (problem) return error(problem);
  const supabase = await supabaseServer();
  const { error: failed } = await supabase.from("writing_samples").update({ body }).eq("id", id);
  if (failed) return error(appCopy.samples.failed);
  refresh();
  return { status: "ok", message: "" };
}

export async function deleteSample(form: FormData): Promise<void> {
  await signedIn();
  const supabase = await supabaseServer();
  await supabase.from("writing_samples").delete().eq("id", String(form.get("id") ?? ""));
  refresh();
}

/** Saves each answered question as its own sample. */
export async function saveAnswers(_previous: SampleState, form: FormData): Promise<SampleState> {
  await signedIn();
  const answers = appCopy.questions.items.map((_q, i) => String(form.get(`answer-${i}`) ?? "").trim()).filter((a) => countWords(a) > 0);
  if (answers.length === 0) return error(appCopy.questions.empty);
  for (const answer of answers) {
    const problem = checkSample(answer);
    if (problem) return error(problem);
  }
  const supabase = await supabaseServer();
  const { count } = await supabase.from("writing_samples").select("id", { count: "exact", head: true });
  if ((count ?? 0) + answers.length > site.samples.max) return error(appCopy.questions.noRoom);
  const { error: failed } = await supabase.from("writing_samples").insert(answers.map((body) => ({ body })));
  if (failed) return error(failed.code === "P0001" ? appCopy.questions.noRoom : appCopy.samples.failed);
  refresh();
  return { status: "ok", message: "" };
}

export type RewriteState = RewriteResult | FunctionError | { status: "idle" };

export async function rewriteDraft(_previous: RewriteState, form: FormData): Promise<RewriteState> {
  await signedIn();
  const draft = String(form.get("draft") ?? "");
  // Anything but "notes" is the default AI-draft rewrite.
  const mode: Mode = form.get("mode") === "notes" ? "notes" : "draft";
  // The draft type the user chose (or accepted); anything unknown means none.
  const chosen = form.get("kind");
  const kind = isKind(chosen) ? chosen : undefined;
  // American spelling only when chosen in Settings (Cam, 16 Oct); British requests stay as before.
  const spelling = form.get("spelling") === "us" ? { spelling: "us" as const } : {};
  if (countWords(draft) === 0) return { status: "error", reason: "empty" };
  if (countWords(draft) > site.draftMaxWords || draft.length > site.draftMaxChars) return { status: "error", reason: "too_long" };
  if (!(await withinRateLimit(`rewrite-ip:${await visitorHash()}`, 3600, 60))) return { status: "error", reason: "rate_limited" };
  const result = await callRewriteFunction<RewriteResult>({ action: "rewrite", draft, mode, ...(kind ? { kind } : {}), ...spelling });
  if (result.status === "error" && result.reason === "signed_out") redirect("/sign-in?next=/app");
  return result;
}

export async function unlockRewrite(token: string): Promise<UnlockResult | FunctionError> {
  await signedIn();
  const result = await callRewriteFunction<UnlockResult>({ action: "unlock", token });
  if (result.status === "error" && result.reason === "signed_out") redirect("/sign-in?next=/app");
  return result;
}
