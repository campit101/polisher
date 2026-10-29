"use client";

import { useEffect } from "react";
import { visitCountingOn } from "@/lib/theme";

/** Counts one page view in our own events table. No cookies, no identifiers; skipped when the visitor
 * has switched visit counting off or sends Global Privacy Control (T11). */
export function ViewBeacon({ name }: { name: string }) {
  useEffect(() => {
    if (!visitCountingOn()) return;
    const body = JSON.stringify({ name, path: window.location.pathname, search: window.location.search });
    navigator.sendBeacon?.("/api/event", new Blob([body], { type: "application/json" }));
  }, [name]);
  return null;
}
