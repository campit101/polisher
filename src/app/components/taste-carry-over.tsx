"use client";

// After a free taste on the front page (R1): the first visit to the Write page signed in saves the
// visitor's answers as writing samples, once, then forgets them in this browser.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { saveTasteAnswers } from "@/app/actions/taste";
import { appCopy } from "@/content/app";
import { OPEN_SAMPLES_EVENT } from "./samples-dialog";
import { TASTE_ANSWERS_KEY, TASTE_DONE_KEY } from "./taste-tool";

export function TasteCarryOver() {
  const router = useRouter();
  const [saved, setSaved] = useState<number | null>(null);
  useEffect(() => {
    let answers: string[] = [];
    try {
      if (localStorage.getItem(TASTE_DONE_KEY) !== "1") return;
      const parsed = JSON.parse(localStorage.getItem(TASTE_ANSWERS_KEY) ?? "[]");
      answers = Array.isArray(parsed) ? parsed.filter((a): a is string => typeof a === "string") : [];
      localStorage.removeItem(TASTE_DONE_KEY);
      localStorage.removeItem(TASTE_ANSWERS_KEY);
    } catch {
      return;
    }
    void saveTasteAnswers(answers).then((result) => {
      if (!result) return;
      setSaved(result.saved);
      // The message sits in the samples pop-up, so make sure it is open.
      window.dispatchEvent(new Event(OPEN_SAMPLES_EVENT));
      router.refresh();
    });
  }, [router]);
  if (saved === null) return null;
  return (
    <p role="status" className="mt-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg-2" data-testid="taste-carried">
      {appCopy.carried(saved)}
    </p>
  );
}
