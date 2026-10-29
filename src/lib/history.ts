// History (Cam, 16 Oct): the last 5 rewrites from both tools, kept in this browser only, per
// account, so a refresh never costs a rewrite. Nothing goes to Polisher's servers, so "Polisher
// never saves drafts or rewrites" stays true. Cleared on sign out and account deletion.
import type { Kind } from "../../supabase/functions/_shared/rewrite/kinds.ts";
import type { Mode } from "../../supabase/functions/_shared/rewrite/prompts.ts";

export const HISTORY_PREFIX = "polisher-history:";
export const HISTORY_MAX = 5;
const CHANGED = "polisher:history";

export type HistoryEntry = { id: string; mode: Mode; kind?: Kind; draft?: string; text: string; at: string };

const keyFor = (userId: string) => `${HISTORY_PREFIX}${userId}`;

function valid(entry: unknown): entry is HistoryEntry {
  const e = entry as Partial<HistoryEntry> | null;
  return !!e && typeof e.id === "string" && (e.mode === "draft" || e.mode === "notes") && typeof e.text === "string" && typeof e.at === "string";
}

/** Newest first, at most 5. Broken or missing storage reads as empty. */
export function readHistory(userId: string): HistoryEntry[] {
  try {
    const saved = JSON.parse(localStorage.getItem(keyFor(userId)) ?? "[]");
    return Array.isArray(saved) ? saved.filter(valid).slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

export function addHistory(userId: string, entry: Omit<HistoryEntry, "id" | "at">): void {
  const next: HistoryEntry = { ...entry, id: crypto.randomUUID(), at: new Date().toISOString() };
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify([next, ...readHistory(userId)].slice(0, HISTORY_MAX)));
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    // Private windows can refuse storage; the rewrite is still on the page.
  }
}

/** Removes every account's history in this browser (sign out, account deletion, Clear history). */
export function clearHistory(): void {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(HISTORY_PREFIX)) localStorage.removeItem(key);
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

export function onHistoryChange(callback: () => void): () => void {
  window.addEventListener(CHANGED, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGED, callback);
    window.removeEventListener("storage", callback);
  };
}
