"use client";

// The writing samples, in a pop-up over the Write page (Cam, 16 Oct), so the tool always stays at the
// top. It opens by itself on every visit while there is too little writing to rewrite, or when the
// link asks for it (?samples=1, used by Settings and the Account page); once a visit (this tab) while
// a sample slot is empty; and from the Edit samples button at any time.
import { type ReactNode, useEffect, useRef } from "react";
import { appCopy } from "@/content/app";
import { CloseIcon } from "./icons";

export const OPEN_SAMPLES_EVENT = "polisher:open-samples";
const NUDGED_KEY = "polisher-samples-nudged";

/** True the first time in this tab; storage that refuses counts as already shown. */
function firstNudge(): boolean {
  try {
    if (sessionStorage.getItem(NUDGED_KEY)) return false;
    sessionStorage.setItem(NUDGED_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function SamplesDialog({ autoOpen, children }: { autoOpen: "always" | "once" | "never"; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const copy = appCopy.samples;

  useEffect(() => {
    if (dialog.current?.open) return;
    if (autoOpen === "always") {
      // Opening because writing is missing is this visit's nudge too, so it does not open again
      // straight after the samples are saved (found in the builder's walkthrough, 16 Oct).
      firstNudge();
      dialog.current?.showModal();
    } else if (autoOpen === "once" && firstNudge()) dialog.current?.showModal();
  }, [autoOpen]);

  useEffect(() => {
    const open = () => {
      if (!dialog.current?.open) dialog.current?.showModal();
    };
    window.addEventListener(OPEN_SAMPLES_EVENT, open);
    return () => window.removeEventListener(OPEN_SAMPLES_EVENT, open);
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="samples-title"
      className="m-auto max-h-[min(90dvh,56rem)] w-[min(100%-2rem,46rem)] overflow-y-auto rounded-2xl border border-line-strong bg-surface p-0 text-fg shadow-[var(--shadow)]"
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
      data-testid="samples"
    >
      <div className="relative p-6 sm:p-8">
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-raised hover:text-fg"
        >
          <CloseIcon />
          <span className="visually-hidden">{copy.close}</span>
        </button>
        <h2 id="samples-title" className="pr-10 text-2xl font-semibold tracking-tight">
          {copy.dialogTitle}
        </h2>
        <p className="mt-2 text-sm text-fg-2">{copy.comeBack}</p>
        {children}
        <div className="mt-8 flex justify-end border-t border-line pt-5">
          <button type="button" onClick={() => dialog.current?.close()} className="btn btn-primary btn-sm">
            {copy.done}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** The button on the Write page that opens the pop-up. */
export function EditSamplesButton({ count }: { count: number }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_SAMPLES_EVENT))} className="btn btn-quiet btn-sm">
      {appCopy.samples.edit(count)}
    </button>
  );
}
