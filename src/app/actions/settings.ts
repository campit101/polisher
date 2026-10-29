"use server";

// The Settings dialog's account parts (Cam, 16 Oct): the optional name, usage, and how many writing
// samples are saved. Visitors who are not signed in get only { signedIn: false }.
import { ui } from "@/content/ui";
import { accountName, saveAccountName } from "@/lib/server/account";
import { usageSummary } from "@/lib/server/rewrite";
import { withinRateLimit } from "@/lib/server/visitor";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { countWords } from "@/lib/words";
import type { UsageView } from "../../../supabase/functions/_shared/rewrite/handler.ts";

export type SettingsData =
  | { signedIn: false }
  | { signedIn: true; firstName: string; lastName: string; usage: UsageView; samples: number; words: number };

export async function settingsData(): Promise<SettingsData> {
  const user = await currentUser();
  if (!user) return { signedIn: false };
  // Read as the user, so Row Level Security decides what is visible.
  const supabase = await supabaseServer();
  const [name, usage, samples] = await Promise.all([accountName(user), usageSummary(user), supabase.from("writing_samples").select("body")]);
  const list = samples.data ?? [];
  return {
    signedIn: true,
    firstName: name.first_name,
    lastName: name.last_name,
    usage,
    samples: list.length,
    words: list.reduce((sum, s) => sum + countWords(s.body), 0),
  };
}

export type NameState = { status: "idle" | "ok" | "error"; message: string };

const NAME_MAX = 50;
// Letters, marks, spaces, hyphens, apostrophes and full stops; anything else (such as control
// characters or angle brackets) is dropped.
const clean = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .replace(/[^\p{L}\p{M}' .\-’]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

export async function saveName(_previous: NameState, form: FormData): Promise<NameState> {
  const copy = ui.settings;
  const user = await currentUser();
  if (!user) return { status: "error", message: copy.nameFailed };
  if (!(await withinRateLimit(`name:${user.id}`, 3600, 30))) return { status: "error", message: copy.nameFailed };
  const first = clean(form.get("first_name"));
  const last = clean(form.get("last_name"));
  if (first.length > NAME_MAX || last.length > NAME_MAX) return { status: "error", message: copy.nameTooLong };
  const saved = await saveAccountName(user, { first_name: first, last_name: last });
  return saved ? { status: "ok", message: copy.nameSaved } : { status: "error", message: copy.nameFailed };
}
