"use server";

import { redirect } from "next/navigation";
import { authCopy } from "@/content/auth";
import { safeNext } from "@/lib/redirect";
import { deleteAccount, hasBillingSubscription } from "@/lib/server/account";
import { createDemoAccount } from "@/lib/server/demo-account";
import { requireEnv } from "@/lib/server/env";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { visitorHash, withinRateLimit } from "@/lib/server/visitor";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { checkFormToken, HONEYPOT_FIELD } from "@/lib/waitlist";

export type FormState = { status: "idle" | "ok" | "error"; message: string };

const failed = (message: string): FormState => ({ status: "error", message });

// Demo sign-in: one press makes a throwaway account (no email of the visitor's, nothing sent) and
// signs it in. Bots get the normal reply with no account made. The database deletes demo accounts
// after 24 hours (lib/server/demo-account.ts).
export async function startDemo(_previous: FormState, form: FormData): Promise<FormState> {
  const copy = authCopy.signIn;
  if (String(form.get(HONEYPOT_FIELD) ?? "") !== "") return failed(copy.tooMany);
  const timing = checkFormToken(form.get("form_token"), requireEnv("IP_HASH_SALT"));
  if (timing === "too-fast") return failed(copy.tooFast);
  if (timing === "invalid") return failed("This form has expired. Reload the page and try again.");

  const allowed = (await withinRateLimit(`demo-ip:${await visitorHash()}`, 3600, 5)) && (await withinRateLimit("demo-all", 3600, 120));
  if (!allowed) return failed(copy.tooMany);

  const made = await createDemoAccount(supabaseAdmin().auth.admin);
  if (!made) return failed(copy.failed);
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword(made);
  if (error) {
    console.error("demo sign-in failed", error.code ?? error.status);
    return failed(copy.failed);
  }
  redirect(safeNext(String(form.get("next") ?? "")));
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/");
}

export async function deleteMyAccount(_previous: FormState, form: FormData): Promise<FormState> {
  const copy = authCopy.account;
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/account");
  if (form.get("confirm") !== "yes") return failed(copy.deleteNeedsConfirm);
  if (await hasBillingSubscription(user)) return failed(copy.deleteBlocked);

  if (!(await deleteAccount(user))) return failed(copy.deleteFailed);
  // The account is gone, so only the cookies need clearing.
  const supabase = await supabaseServer();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/account-deleted");
}
