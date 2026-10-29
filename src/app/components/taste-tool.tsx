"use client";

// The front-page tool (R1): one full rewrite without an account. The visitor answers at least 3 of
// the own-words questions (kept in this browser only), pastes a draft of up to 300 words and picks its
// type. A small bot check runs first. After the result, a sign-in pop-up offers another rewrite and
// Create rewrite; signing in saves the answers as writing samples (TasteCarryOver on the Write page).
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getTasteChallenge, tasteRewrite, type TasteState } from "@/app/actions/taste";
import { site } from "@/config/site";
import { usage } from "@/config/usage";
import { appCopy } from "@/content/app";
import { landing } from "@/content/landing";
import { solveChallenge } from "@/lib/pow-solve";
import { askSession } from "@/lib/session-client";
import { useSpelling } from "@/lib/spelling-pref";
import type { Utm } from "@/lib/utm";
import { countWords } from "@/lib/words";
import { type Kind, suggestKind } from "../../../supabase/functions/_shared/rewrite/kinds.ts";
import { Changes, Checks, CopyButton, errorMessage, ExampleButtons, KindChoice, TextCard } from "./app-forms";
import { SignInForm } from "./auth-forms";
import { ReadyMadeExamples } from "./ready-made-examples";
import { CheckIcon, CloseIcon, LockIcon } from "./icons";

export const TASTE_ANSWERS_KEY = "polisher-taste-answers";
export const TASTE_DONE_KEY = "polisher-taste-done";

const copy = landing.tool;
const QUESTIONS = appCopy.questions.items;
const field =
  "w-full rounded-xl border border-line-strong bg-canvas px-4 py-3 text-[1rem] leading-relaxed text-fg placeholder:text-fg-3 focus:border-accent-text focus:outline-none";

// The answers live in this browser's storage, read through React's external-store hook so the page
// renders the same on the server (no answers) and in the browser (saved answers).
const answersStore = {
  get: () => {
    try {
      return window.localStorage.getItem(TASTE_ANSWERS_KEY) ?? "[]";
    } catch {
      return "[]";
    }
  },
  set: (value: string) => {
    remember(TASTE_ANSWERS_KEY, value);
    window.dispatchEvent(new StorageEvent("storage", { key: TASTE_ANSWERS_KEY }));
  },
  subscribe: (callback: () => void) => {
    window.addEventListener("storage", callback);
    return () => window.removeEventListener("storage", callback);
  },
};

// Whether this browser has had its free try, read the same way as the answers.
const doneStore = {
  get: () => {
    try {
      return window.localStorage.getItem(TASTE_DONE_KEY) === "1";
    } catch {
      return false;
    }
  },
  set: () => {
    remember(TASTE_DONE_KEY, "1");
    window.dispatchEvent(new StorageEvent("storage", { key: TASTE_DONE_KEY }));
  },
  subscribe: answersStore.subscribe,
};

function parseAnswers(raw: string): string[] {
  try {
    const saved = JSON.parse(raw);
    return QUESTIONS.map((_, i) => (Array.isArray(saved) && typeof saved[i] === "string" ? saved[i] : ""));
  } catch {
    return QUESTIONS.map(() => "");
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the answers still work until the page closes.
  }
}

/** signedIn comes from the server when it knows, so a signed-in visitor never sees the free try flash first. */
export function TasteTool({ formToken, utm, signedIn: known }: { formToken: string; utm: Utm; signedIn?: boolean }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(known ? true : null);
  const answers = parseAnswers(useSyncExternalStore(answersStore.subscribe, answersStore.get, () => "[]"));
  const [draft, setDraft] = useState("");
  const [picked, setPicked] = useState<Kind | null>(null);
  const [phase, setPhase] = useState<"idle" | "checking" | "working">("idle");
  const [state, setState] = useState<TasteState>({ status: "idle" });
  // Set when the visitor presses Rewrite before the writing tab is done; the message updates as they type.
  const [needWriting, setNeedWriting] = useState(false);
  const spelling = useSpelling();
  const dialog = useRef<HTMLDialogElement>(null);
  const writing = useRef<HTMLDialogElement>(null);
  const [signInFor, setSignInFor] = useState<"after" | "unlock" | "used">("after");
  // One free try per browser (Cam, 16 Oct): once it has worked, Rewrite asks for sign-in instead.
  const done = useSyncExternalStore(doneStore.subscribe, doneStore.get, () => false);

  useEffect(() => {
    if (known) return;
    void askSession().then((answer) => setSignedIn(answer.signedIn));
  }, [known]);

  const answered = answers.filter((a) => countWords(a) > 0).length;
  const answerWords = countWords(answers.join(" "));
  const writingReady = answered >= 3 && answerWords >= site.tasteMinWords;
  const words = countWords(draft);
  // The free try takes drafts of up to 300 words (Cam, 16 Oct).
  const tooLong = words > usage.free.draftMaxWords || draft.length > site.draftMaxChars;
  // Work until a draft suggests another type (Cam, 16 Oct).
  const kind = picked ?? (words === 0 ? "work" : suggestKind(draft));

  function setAnswer(i: number, value: string) {
    answersStore.set(JSON.stringify(answers.map((a, j) => (j === i ? value : a))));
  }

  async function submit() {
    if (done) {
      openSignIn("used");
      return;
    }
    if (!writingReady) {
      setNeedWriting(true);
      return;
    }
    setNeedWriting(false);
    setPhase("checking");
    const challenge = await getTasteChallenge();
    if (!challenge) {
      setPhase("idle");
      setState({ status: "error", reason: "bot_check" });
      return;
    }
    const nonce = await solveChallenge(challenge.salt, challenge.difficulty);
    setPhase("working");
    const form = new FormData();
    form.set("draft", draft);
    form.set("kind", kind);
    form.set("spelling", spelling);
    form.set("answers", JSON.stringify(answers));
    form.set("challenge", JSON.stringify(challenge));
    form.set("nonce", nonce);
    const result = await tasteRewrite({ status: "idle" }, form);
    setPhase("idle");
    if (result.status === "error" && result.reason === "taste_used") {
      // The server knows this browser (or connection) has had its free try.
      doneStore.set();
      openSignIn("used");
      return;
    }
    setState(result);
    if (result.status === "ok") {
      doneStore.set();
      setTimeout(() => {
        setSignInFor("after");
        dialog.current?.showModal();
      }, 600);
    }
  }

  if (signedIn) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-line-strong bg-surface px-6 py-10 text-center shadow-[var(--shadow)]" data-testid="taste-signed-in">
        <p className="max-w-[28rem] text-fg-2">{copy.signedIn}</p>
        <Link href="/app" className="btn btn-primary mt-5">
          {copy.openApp}
        </Link>
      </div>
    );
  }

  const busy = phase !== "idle";
  const openSignIn = (reason: "after" | "unlock" | "used") => {
    setSignInFor(reason);
    dialog.current?.showModal();
  };
  return (
    // The same tool as the Write page (Cam, 16 Oct): Create rewrite is locked until signing in, and the
    // own-words questions open in a pop-up like the Write page's samples.
    <section aria-label={copy.label} className="grid gap-6 rounded-2xl border border-line-strong bg-surface p-4 shadow-[var(--shadow)] sm:p-6" data-testid="taste">
      {/* One block (Cam, 17 Oct): the tabs on one line with Your writing beside them, or under them and
          as wide on a phone. */}
      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium text-fg-2">{appCopy.modes.legend}</legend>
          <div className="segmented w-full *:flex-1 sm:w-fit sm:*:flex-none" data-testid="mode">
            <label>
              <input type="radio" name="taste-mode" value="draft" checked readOnly />
              {appCopy.modes.draft}
            </label>
            <button type="button" onClick={() => openSignIn("unlock")} className="segmented-locked" data-testid="locked-create">
              <LockIcon size={14} />
              {appCopy.modes.notes}
              {/* The lock says it; the words stay for screen readers (Cam, 17 Oct: no spill). */}
              <span className="sr-only">, {copy.locked}</span>
            </button>
          </div>
        </fieldset>
        <button type="button" onClick={() => writing.current?.showModal()} className="btn btn-quiet btn-sm relative w-full sm:w-auto">
          {copy.writingButton(Math.min(answered, 3))}
          {/* Required until 3 answers and enough words; then a tick (Cam, 16 Oct). */}
          <span className="corner" aria-hidden="true">
            <span className={`corner-badge ${writingReady ? "corner-badge-done" : "corner-badge-required"}`} data-testid={writingReady ? "writing-done" : "writing-required"}>
              {writingReady ? "✓" : "*"}
            </span>
          </span>
          <span className="visually-hidden">, {writingReady ? copy.complete : copy.required}</span>
        </button>
      </div>

      <KindChoice kind={kind} suggested={picked === null && words > 0} onPick={setPicked} />

      <div className="-mt-3 grid gap-3">
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="taste-draft" className="text-lg font-semibold tracking-tight">
            {copy.draftLabel}
          </label>
          <ExampleButtons hasText={draft !== ""} onExample={() => setDraft(appCopy.example.draft)} onClear={() => setDraft("")} />
        </div>
        <textarea id="taste-draft" rows={12} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={copy.placeholder} className={field} />
        <div className="grid gap-1">
          <p className={`text-sm ${tooLong ? "font-medium text-mark" : "text-fg-3"}`}>
            {tooLong ? (words > usage.free.draftMaxWords ? appCopy.draft.freeTooLong : appCopy.draft.tooLong) : appCopy.draft.count(words, usage.free.draftMaxWords)}
          </p>
        </div>
        <div>
          <button type="button" onClick={submit} disabled={busy || (!done && (words === 0 || tooLong))} className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50" data-testid="taste-rewrite">
            {done ? copy.signInButton : copy.button}
          </button>
        </div>
        {done && state.status !== "ok" ? (
          <p className="text-sm font-medium text-fg-2" data-testid="taste-used">
            {copy.used}
          </p>
        ) : null}
        {needWriting && !writingReady && !done ? (
          <div role="alert" className="grid justify-items-start gap-2 text-sm font-medium text-mark" data-testid="taste-need">
            <p>{copy.needWriting}</p>
            <p>{copy.progress(Math.min(answered, 3), answerWords)}</p>
            <button type="button" onClick={() => writing.current?.showModal()} className="btn btn-quiet btn-sm text-fg">
              {copy.goToWriting}
            </button>
          </div>
        ) : null}
        {!done ? (
          <p className="text-sm text-fg-2" data-testid="taste-free">
            {copy.free}
          </p>
        ) : null}
        {/* Under Rewrite, the tool's last line (Cam, 17 Oct). */}
        <p className="text-sm text-fg-3" data-testid="not-stored">
          {appCopy.draft.notStored}
        </p>
      </div>

      <div aria-live="polite" className="grid gap-4">
        {phase === "checking" ? <p className="text-fg-2">{copy.checking}</p> : null}
        {phase === "working" ? <p className="text-fg-2">{copy.working}</p> : null}
        {phase === "idle" ? <TasteResult state={state} onSignIn={() => openSignIn("after")} /> : null}
      </div>

      {/* The questions, in the same kind of pop-up the Write page uses for samples. */}
      <dialog
        ref={writing}
        aria-labelledby="taste-writing-title"
        className="m-auto max-h-[min(90dvh,56rem)] w-[min(100%-2rem,46rem)] overflow-y-auto rounded-2xl border border-line-strong bg-surface p-0 text-fg shadow-[var(--shadow)]"
        onClick={(event) => {
          if (event.target === event.currentTarget) writing.current?.close();
        }}
      >
        <div className="relative grid gap-4 p-6 sm:p-8" data-testid="taste-writing">
          <button type="button" onClick={() => writing.current?.close()} className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-raised hover:text-fg">
            <CloseIcon />
            <span className="visually-hidden">{appCopy.samples.close}</span>
          </button>
          <h2 id="taste-writing-title" className="pr-10 text-2xl font-semibold tracking-tight">
            {copy.writingTitle}
          </h2>
          <p className="text-sm text-fg-2">{copy.writingIntro}</p>
          {QUESTIONS.map((question, i) => (
            <div key={question} className="grid gap-1.5">
              <label htmlFor={`taste-answer-${i}`} className="text-sm font-medium text-fg">
                {i + 1}. {question}
              </label>
              <textarea id={`taste-answer-${i}`} rows={3} value={answers[i] ?? ""} onChange={(e) => setAnswer(i, e.target.value)} className={field} />
            </div>
          ))}
          <p className={`text-sm ${writingReady ? "text-good" : "text-fg-3"}`} data-testid="taste-progress">
            {copy.progress(Math.min(answered, 3), answerWords)}
          </p>
          <div className="mt-2 flex justify-end border-t border-line pt-5">
            <button type="button" onClick={() => writing.current?.close()} className="btn btn-primary btn-sm">
              {copy.done}
            </button>
          </div>
        </div>
      </dialog>

      <dialog
        ref={dialog}
        aria-labelledby="taste-signin-title"
        className="m-auto w-[min(100%-2rem,28rem)] rounded-2xl border border-line-strong bg-surface p-6 text-fg shadow-[var(--shadow)]"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <h2 id="taste-signin-title" className="text-xl font-semibold tracking-tight">
          {signInFor === "unlock" ? copy.after.unlockHeading : signInFor === "used" ? copy.after.usedHeading : copy.after.heading}
        </h2>
        <ul className="mt-4 grid gap-3" data-testid="unlock-items">
          {copy.after.items.map((item) => (
            <li key={item.title} className="flex gap-3">
              <span className="mt-0.5 text-accent-text">
                <CheckIcon size={18} />
              </span>
              <span>
                <span className="block font-medium">{item.title}</span>
                <span className="block text-sm text-fg-2">{item.body}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-fg-2">{copy.after.body}</p>
        <div className="mt-4">
          <SignInForm formToken={formToken} next="/app" utm={utm} />
        </div>
        <button type="button" onClick={() => dialog.current?.close()} className="btn btn-quiet btn-sm mt-4">
          {copy.after.close}
        </button>
      </dialog>
    </section>
  );
}

function TasteResult({ state, onSignIn }: { state: TasteState; onSignIn: () => void }) {
  if (state.status === "idle") return null;
  if (state.status === "ok") {
    return (
      <div className="grid gap-4">
        <h3 className="text-lg font-semibold tracking-tight">{copy.resultHeading}</h3>
        <TextCard text={state.text} testId="taste-result">
          <CopyButton text={state.text} />
        </TextCard>
        <Changes lines={state.summary} />
        <Checks warnings={state.warnings} mode={state.mode} />
        <div>
          <button type="button" onClick={onSignIn} className="btn btn-primary">
            {copy.signInButton}
          </button>
        </div>
      </div>
    );
  }
  if (state.status === "needs_samples") return <p className="text-sm font-medium text-mark">{copy.needWriting}</p>;
  if (state.status === "busy")
    return (
      <div>
        <p role="status" className="text-fg-2" data-testid="busy">
          {appCopy.limits.busy}
        </p>
        <ReadyMadeExamples />
      </div>
    );
  const message = state.reason === "taste_used" ? copy.used : state.reason === "bot_check" ? copy.botFailed : errorMessage(state.reason);
  return (
    <p role="alert" className="text-sm font-medium text-mark">
      {message}
    </p>
  );
}
