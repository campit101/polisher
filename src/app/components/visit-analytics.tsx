"use client";

import { Analytics } from "@vercel/analytics/next";
import { visitCountingOn } from "@/lib/theme";

/** Vercel's cookieless page counts, dropped when the visitor has switched visit counting off (T11). */
export function VisitAnalytics() {
  return <Analytics beforeSend={(event) => (visitCountingOn() ? event : null)} />;
}
