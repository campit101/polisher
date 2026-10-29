// Theme and motion preferences. Dark is the default. A choice is only stored (in this browser's
// localStorage) when the visitor changes it in Settings: a user-requested preference, no tracking.

export type ThemePref = "system" | "light" | "dark";
export type MotionPref = "system" | "reduced";

export const THEME_KEY = "polisher-theme";
export const MOTION_KEY = "polisher-motion";
export const DEFAULT_THEME: ThemePref = "dark";

export function resolveTheme(pref: ThemePref, prefersLight: boolean): "light" | "dark" {
  if (pref === "system") return prefersLight ? "light" : "dark";
  return pref;
}

/** Runs in <head> before the page paints, so there is no flash of the wrong theme. */
export const themeBootScript = `(function(){var d=document.documentElement;try{var p=localStorage.getItem("${THEME_KEY}")||"${DEFAULT_THEME}";var l=window.matchMedia("(prefers-color-scheme: light)").matches;d.dataset.theme=p==="system"?(l?"light":"dark"):(p==="light"?"light":"dark");if(localStorage.getItem("${MOTION_KEY}")==="reduced")d.dataset.motion="reduced";}catch(e){d.dataset.theme="dark";}})();`;

// Visit counting (T11): on unless switched off in Settings or the browser sends Global Privacy Control.
export type CountingPref = "on" | "off";
export const COUNTING_KEY = "polisher-count-visits";

export function globalPrivacyControl(): boolean {
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

/** Browser only. True when this visitor's page views may be counted. */
export function visitCountingOn(): boolean {
  if (globalPrivacyControl()) return false;
  try {
    return localStorage.getItem(COUNTING_KEY) !== "off";
  } catch {
    return true;
  }
}
