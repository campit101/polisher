"use client";

// The History page's list (Cam, 16 Oct): the last 5 rewrites from both tools, read from this
// browser only (src/lib/history.ts), newest first, each labelled with the tool that made it.
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { appCopy } from "@/content/app";
import { clearHistory, type HistoryEntry, onHistoryChange, readHistory } from "@/lib/history";
import { CopyButton, TextCard } from "./app-forms";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export function HistoryList({ userId }: { userId: string }) {
  const copy = appCopy.history;
  // Read as a string so the snapshot stays stable between renders.
  const raw = useSyncExternalStore(onHistoryChange, () => JSON.stringify(readHistory(userId)), () => "[]");
  const entries = JSON.parse(raw) as HistoryEntry[];

  if (entries.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-line p-6 text-center">
        <p className="text-fg-2">{copy.empty}</p>
        <Link href="/app" className="btn btn-primary btn-sm mt-5">
          {copy.open}
        </Link>
      </div>
    );
  }
  return (
    <>
      <ol className="mt-8 grid gap-6">
        {entries.map((entry) => (
          <li key={entry.id} className="grid gap-3" data-testid="history-item">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full border border-accent-text/40 bg-accent-soft px-3 py-0.5 font-medium text-accent-text">{appCopy.modes[entry.mode]}</span>
              <span className="text-fg-3">{when(entry.at)}</span>
            </div>
            <TextCard text={entry.text} testId="history-text">
              <CopyButton text={entry.text} />
            </TextCard>
            {entry.draft ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-fg-2">{copy.pasted}</summary>
                <p className="mt-2 whitespace-pre-wrap break-words text-fg-3">{entry.draft}</p>
              </details>
            ) : null}
          </li>
        ))}
      </ol>
      <button type="button" onClick={clearHistory} className="btn btn-quiet btn-sm mt-8">
        {copy.clear}
      </button>
    </>
  );
}
