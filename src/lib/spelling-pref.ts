// British or American spelling for rewrites (Cam, 16 Oct). Chosen in Settings, kept in this browser
// like the theme, and sent with every rewrite. British unless the person picks American.
import { useSyncExternalStore } from "react";

export type SpellingPref = "uk" | "us";
export const SPELLING_KEY = "polisher-spelling";

// Kept in memory too, for private windows that refuse storage.
let chosen: SpellingPref | null = null;

function read(): SpellingPref {
  if (chosen) return chosen;
  try {
    return localStorage.getItem(SPELLING_KEY) === "us" ? "us" : "uk";
  } catch {
    return "uk";
  }
}

export function saveSpelling(pref: SpellingPref) {
  chosen = pref;
  try {
    localStorage.setItem(SPELLING_KEY, pref);
  } catch {
    // Private windows can refuse storage; the choice above still applies until the page closes.
  }
  window.dispatchEvent(new StorageEvent("storage", { key: SPELLING_KEY }));
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

/** The current choice; British on the server and until the browser has read storage. */
export function useSpelling(): SpellingPref {
  return useSyncExternalStore(subscribe, read, () => "uk");
}
