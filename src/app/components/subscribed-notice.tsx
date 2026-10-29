"use client";

// Straight after paying (Cam, 16 Oct): a short thank-you that fades away after 5 seconds. The
// ?subscribed=1 that brought it is taken out of the address at once, so a refresh never shows it again.
import { useEffect, useState } from "react";
import { billingCopy } from "@/content/billing";

const SHOWN_MS = 5_000;
const FADE_MS = 400;

export function SubscribedNotice() {
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">("shown");

  useEffect(() => {
    // Plain history change: the page stays as it is, only the address loses ?subscribed=1.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    const leave = setTimeout(() => setPhase("leaving"), SHOWN_MS);
    const gone = setTimeout(() => setPhase("gone"), SHOWN_MS + FADE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(gone);
    };
  }, []);

  if (phase === "gone") return null;
  return (
    <p
      role="status"
      className={`notice-in mt-6 rounded-2xl border border-accent-text/40 bg-accent-soft p-4 text-sm font-medium text-fg transition-[opacity,transform] duration-[400ms] ease-out ${phase === "leaving" ? "-translate-y-1 opacity-0" : ""}`}
      data-testid="subscribed-notice"
    >
      {billingCopy.subscribed.notice}
    </p>
  );
}
