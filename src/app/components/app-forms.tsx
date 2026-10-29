"use client";

import { type FormEvent, useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { addSample, deleteSample, rewriteDraft, type RewriteState, type SampleState, saveAnswers, unlockRewrite, updateSample } from "@/app/actions/app";
import { site } from "@/config/site";
import { usage as limits } from "@/config/usage";
import { appCopy } from "@/content/app";
import { addHistory } from "@/lib/history";
import { useSpelling } from "@/lib/spelling-pref";
import { countWords } from "@/lib/words";
import { type Kind, KINDS, suggestKind } from "../../../supabase/functions/_shared/rewrite/kinds.ts";
import type { MeaningWarnings } from "../../../supabase/functions/_shared/rewrite/meaning.ts";
import type { Mode, UsageView } from "../../../supabase/functions/_shared/rewrite/handler.ts";
import { SubscribeButton } from "./billing-buttons";
import { wordsLeft } from "./usage-bars";
import { ReadyMadeExamples } from "./ready-made-examples";
import { UsageMeter } from "./usage-meter";

const idleSample: SampleState = { status: "idle", message: "" };
const field =
  "w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-[1.0625rem] leading-relaxed text-fg placeholder:text-fg-3 focus:border-accent-text focus:outline-none";

function FormError({ state, id }: { state: SampleState; id: string }) {
  return state.status === "error" ? (
    <p id={id} role="alert" className="text-sm font-medium text-mark">
      {state.message}
    </p>
  ) : null;
}

export function AddSampleForm() {
  const copy = appCopy.samples;
  const [state, action, pending] = useActionState(addSample, idleSample);
  return (
    // React empties the box after a successful save.
    <form action={action} className="grid gap-3">
      <label htmlFor="new-sample" className="text-sm font-medium text-fg">
        {copy.addLabel}
      </label>
      <textarea
        id="new-sample"
        name="body"
        rows={6}
        required
        placeholder={copy.addPlaceholder}
        className={field}
        aria-describedby={state.status === "error" ? "add-sample-error" : undefined}
      />
      <FormError state={state} id="add-sample-error" />
      <div>
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          {pending ? copy.adding : copy.add}
        </button>
      </div>
    </form>
  );
}

export function EditSampleForm({ id, body, index }: { id: string; body: string; index: number }) {
  const copy = appCopy.samples;
  const [state, action, pending] = useActionState(updateSample, idleSample);
  const [text, setText] = useState(body);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`sample-${id}`} className="visually-hidden">
        {copy.sampleLabel(index)}
      </label>
      <textarea id={`sample-${id}`} name="body" rows={6} value={text} onChange={(e) => setText(e.target.value)} className={field} />
      <FormError state={state} id={`sample-${id}-error`} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || text.trim() === body.trim()} className="btn btn-quiet btn-sm">
          {copy.save}
        </button>
        <button type="submit" formAction={deleteSample} className="btn btn-sm text-mark hover:bg-mark-soft" data-testid="delete-sample">
          {copy.remove}
        </button>
        <span className="text-sm text-fg-3">{copy.words(countWords(text))}</span>
      </div>
    </form>
  );
}

export function QuestionsForm() {
  const copy = appCopy.questions;
  const [state, action, pending] = useActionState(saveAnswers, idleSample);
  return (
    <form action={action} className="mt-4 grid gap-5">
      <p className="text-fg-2">{copy.intro}</p>
      {copy.items.map((question, i) => (
        <div key={question} className="grid gap-2">
          <label htmlFor={`answer-${i}`} className="font-medium text-fg">
            {i + 1}. {question}
          </label>
          <textarea id={`answer-${i}`} name={`answer-${i}`} rows={4} className={field} />
        </div>
      ))}
      <FormError state={state} id="answers-error" />
      <div>
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          {pending ? copy.saving : copy.save}
        </button>
      </div>
    </form>
  );
}

// The sealed token for a locked rewrite is kept in this browser only (it is encrypted; only the
// server can open it) so it survives the trip to Stripe Checkout and back.
const LOCKED_KEY = "polisher-locked-rewrite";
// mode says which tool made it, so it waits and opens there (16 Oct; older records mean draft).
type Locked = { token: string; expiresAt: string; mode: Mode };

function readLocked(raw: string | null): Locked | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Locked>;
    if (typeof value.token !== "string" || typeof value.expiresAt !== "string" || !(Date.parse(value.expiresAt) > Date.now())) return null;
    return { token: value.token, expiresAt: value.expiresAt, mode: value.mode === "notes" ? "notes" : "draft" };
  } catch {
    return null;
  }
}

const storage = {
  get: () => {
    try {
      return window.localStorage.getItem(LOCKED_KEY);
    } catch {
      return null;
    }
  },
  set: (value: string | null) => {
    try {
      if (value === null) window.localStorage.removeItem(LOCKED_KEY);
      else window.localStorage.setItem(LOCKED_KEY, value);
    } catch {
      // Private browsing can refuse storage; the locked rewrite then cannot be reopened later.
    }
    window.dispatchEvent(new StorageEvent("storage", { key: LOCKED_KEY }));
  },
  subscribe: (callback: () => void) => {
    window.addEventListener("storage", callback);
    return () => window.removeEventListener("storage", callback);
  },
};

/** Copies with the clipboard API, or the older copy command where the browser blocks it. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const done = document.execCommand("copy");
    area.remove();
    return done;
  }
}

/** Says Copied! for 2 seconds after a click, then goes back to Copy. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-sm ${copied ? "btn-primary" : "btn-quiet"}`}
      onClick={async () => {
        if (!(await copyText(text))) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <span aria-live="polite">{copied ? appCopy.result.copied : appCopy.result.copy}</span>
    </button>
  );
}

export function Checks({ warnings, mode }: { warnings: MeaningWarnings; mode: Mode }) {
  const copy = appCopy.result;
  const groups: [string, string[]][] = [
    [copy.numbers, warnings.numbers],
    [copy.links, warnings.links],
    [copy.quotesChanged, warnings.quotationsChanged],
    [copy.quotesPunctuation, warnings.quotationsPunctuation],
    [copy.added, warnings.added ?? []],
    [copy.claims, warnings.claims ?? []],
    [copy.certainty, warnings.certainty ?? []],
  ];
  // In Create mode the person wrote notes, not a draft, so the labels say so.
  const shown = groups.filter(([, items]) => items.length > 0).map(([label, items]) => [mode === "notes" ? label.replace("your draft", "your notes") : label, items] as [string, string[]]);
  return (
    <section aria-labelledby="checks-heading" className="rounded-2xl border border-line p-5" data-testid="checks">
      <h3 id="checks-heading" className="font-semibold tracking-tight">
        {copy.checkHeading}
      </h3>
      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-fg-2">{copy.noChecks}</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-fg-2">{mode === "notes" ? copy.notesCheckIntro : copy.checkIntro}</p>
          {shown.map(([label, items]) => (
            <div key={label} className="mt-3">
              <p className="text-sm font-medium text-fg">{label}</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-fg-2">
                {items.map((item) => (
                  <li key={item} className="break-words">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

export function Changes({ lines }: { lines: string[] }) {
  return (
    <section aria-labelledby="changes-heading" className="rounded-2xl border border-line p-5" data-testid="changes">
      <h3 id="changes-heading" className="font-semibold tracking-tight">
        {appCopy.result.changesHeading}
      </h3>
      <ul className="mt-2 list-disc pl-5 text-sm text-fg-2">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

export function TextCard({ text, testId, children }: { text: string; testId: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line-strong bg-surface p-5 shadow-[var(--shadow)]">
      <div className="font-serif text-[1.0625rem] leading-relaxed whitespace-pre-wrap break-words text-fg" data-testid={testId}>
        {text}
      </div>
      {children ? <div className="mt-4 flex flex-wrap items-center gap-3">{children}</div> : null}
    </div>
  );
}

export function errorMessage(reason: string): string {
  return (appCopy.errors as Record<string, string>)[reason] ?? appCopy.errors.general;
}

/** Shown on later visits, inside the tool that made it, while a locked rewrite can still be opened. */
function LockedWaiting() {
  const copy = appCopy.locked;
  return (
    <div className="rounded-2xl border border-accent-text/40 bg-accent-soft p-5" data-testid="locked-waiting">
      <p className="font-semibold tracking-tight">{copy.heading}</p>
      <p className="mt-1 text-sm text-fg-2">{copy.waiting}</p>
      <div className="mt-4">
        <SubscribeButton label={copy.subscribe} className="btn btn-primary btn-sm" />
        <p className="mt-2 text-sm text-fg-2">{copy.refund}</p>
      </div>
    </div>
  );
}

/**
 * Work, Email, Text or Article. What each is for is explained in How it works on the front page,
 * not in ? badges on the tool (Cam, 16 Oct).
 */
export function KindChoice({ kind, suggested, onPick }: { kind: Kind; suggested: boolean; onPick: (kind: Kind) => void }) {
  const copy = appCopy.kinds;
  return (
    // Outside the form, like the mode choice: React resets a form after its action.
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium text-fg-2">{copy.legend}</legend>
      <div className="segmented w-fit max-w-full flex-wrap" data-testid="kind">
        {KINDS.map((value) => (
          <label key={value}>
            <input type="radio" name="kind-choice" value={value} checked={kind === value} onChange={() => onPick(value)} />
            {copy[value]}
          </label>
        ))}
      </div>
      <p aria-live="polite" className="min-h-5 text-sm text-fg-3">
        {suggested ? copy.suggested(copy[kind]) : ""}
      </p>
    </fieldset>
  );
}

/** One tool's own text, chosen type and last result, kept while the other tab is in use. */
type ToolResult = RewriteState | { status: "unlocked"; text: string; mode: Mode } | { status: "unlock_failed"; message: string };
type ToolState = { draft: string; picked: Kind | null; result: ToolResult };
const emptyTool: ToolState = { draft: "", picked: null, result: { status: "idle" } };

/**
 * Two tools on two tabs (Cam, 16 Oct): Rewrite AI draft and Create rewrite. Each keeps its own text
 * and result when the other tab is used, and shows its result straight under its button. A locked
 * rewrite waits in the tool it was made in and opens there by itself once the account is
 * subscribed; it is not kept on the page after that, but History keeps it.
 */
export function RewritePanel({
  userId,
  ready,
  missing,
  paid,
  usage,
}: {
  userId: string;
  ready: boolean;
  missing: { samples: number; words: number };
  paid: boolean;
  usage: UsageView;
}) {
  const copy = appCopy.draft;
  const [mode, setMode] = useState<Mode>("draft");
  const [tools, setTools] = useState<Record<Mode, ToolState>>({ draft: emptyTool, notes: emptyTool });
  const [currentUsage, setCurrentUsage] = useState(usage);
  const [pending, setPending] = useState<Mode | null>(null);
  const spelling = useSpelling();
  const locked = readLocked(useSyncExternalStore(storage.subscribe, storage.get, () => null));
  const tool = tools[mode];
  const notes = mode === "notes";
  const words = countWords(tool.draft);
  // Work until the text suggests another type, then the person's own pick (Cam, 16 Oct).
  const kind = tool.picked ?? (words === 0 ? "work" : suggestKind(tool.draft));
  // Free drafts are capped at 300 words, subscribers' at 1,000 (Cam, 16 Oct).
  const maxWords = currentUsage.tier === "free" ? limits.free.draftMaxWords : site.draftMaxWords;
  const tooLong = words > maxWords || tool.draft.length > site.draftMaxChars;
  // Free accounts are told before the locked one is made (launch decision 3).
  const nextLocked = currentUsage.tier === "free" && currentUsage.used >= currentUsage.shown && currentUsage.used < currentUsage.max;
  const freeUsedUp = currentUsage.tier === "free" && currentUsage.used >= currentUsage.max;
  const update = (which: Mode, patch: Partial<ToolState>) => setTools((all) => ({ ...all, [which]: { ...all[which], ...patch } }));

  // A locked rewrite from this browser: show its tool, and open it there once the account pays.
  const opened = useRef(false);
  useEffect(() => {
    if (!locked || opened.current) return;
    opened.current = true;
    const which = locked.mode;
    const token = locked.token;
    // State changes happen in the promise chain, after this render (React's effect rule).
    void Promise.resolve()
      .then(() => {
        setMode(which);
        if (!paid) return null;
        setPending(which);
        return unlockRewrite(token);
      })
      .then((result) => {
        if (!result) return;
        if (result.status === "ok") {
          storage.set(null);
          update(which, { result: { status: "unlocked", text: result.text, mode: which } });
          addHistory(userId, { mode: which, text: result.text });
        } else {
          if (result.status === "expired") storage.set(null);
          update(which, { result: { status: "unlock_failed", message: result.status === "expired" ? appCopy.locked.expired : result.status === "not_subscribed" ? appCopy.locked.notSubscribed : appCopy.errors.general } });
        }
      })
      .catch(() => update(which, { result: { status: "unlock_failed", message: appCopy.errors.general } }))
      .finally(() => setPending(null));
  }, [locked, paid, userId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const which = mode;
    const draft = tool.draft;
    const form = new FormData();
    form.set("draft", draft);
    form.set("mode", which);
    form.set("kind", kind);
    form.set("spelling", spelling);
    setPending(which);
    let result: RewriteState;
    try {
      result = await rewriteDraft({ status: "idle" }, form);
    } catch {
      result = { status: "error", reason: "server" };
    }
    if (result.status === "locked") storage.set(JSON.stringify({ token: result.token, expiresAt: result.expiresAt, mode: which }));
    if (result.status === "ok") addHistory(userId, { mode: which, kind, draft, text: result.text });
    if ("usage" in result) setCurrentUsage(result.usage);
    update(which, { result });
    setPending(null);
  }

  const example = notes ? appCopy.example.notes : appCopy.example.draft;
  // The waiting card belongs to the tool the locked rewrite came from, and only while it has nothing newer.
  const waitingHere = !paid && locked?.mode === mode && tool.result.status === "idle";
  // One Subscribe button at a time: the locked card or a free-limit message already has one.
  const resultSubscribes = waitingHere || tool.result.status === "locked" || (tool.result.status === "limit" && tool.result.limit === "free");

  return (
    <div className="grid gap-6">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium text-fg-2">{appCopy.modes.legend}</legend>
        <div className="segmented w-full *:flex-1 sm:w-fit sm:*:flex-none" data-testid="mode">
          {(["draft", "notes"] as const).map((value) => (
            <label key={value}>
              <input type="radio" name="mode-choice" value={value} checked={mode === value} onChange={() => setMode(value)} />
              {appCopy.modes[value]}
            </label>
          ))}
        </div>
      </fieldset>
      <KindChoice kind={kind} suggested={tool.picked === null && words > 0} onPick={(picked) => update(mode, { picked })} />
      <form onSubmit={submit} className="-mt-3 grid gap-3">
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="draft" className="text-lg font-semibold tracking-tight">
            {notes ? appCopy.notes.heading : copy.heading}
          </label>
          <ExampleButtons hasText={tool.draft !== ""} onExample={() => update(mode, { draft: example })} onClear={() => update(mode, { draft: "" })} />
        </div>
        {notes ? (
          <p id="notes-hint" className="-mt-1 text-sm text-fg-2">
            {appCopy.notes.hint}
          </p>
        ) : null}
        <textarea
          id="draft"
          name="draft"
          rows={12}
          value={tool.draft}
          onChange={(e) => update(mode, { draft: e.target.value })}
          placeholder={notes ? appCopy.notes.placeholder : copy.placeholder}
          aria-describedby={notes ? "notes-hint draft-count" : "draft-count"}
          className={field}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <p id="draft-count" className={`text-sm ${tooLong ? "font-medium text-mark" : "text-fg-3"}`}>
              {tooLong ? (currentUsage.tier === "free" && words > maxWords ? copy.freeTooLong : copy.tooLong) : copy.count(words, maxWords)}
            </p>
            {/* A subscriber sees what this draft will use before pressing the button (credits by the word). */}
            {currentUsage.tier === "paid" && words > 0 && !tooLong ? (
              <p className="text-sm text-fg-2" data-testid="draft-credits">
                {copy.credits(words)}
              </p>
            ) : null}
          </div>
          <UsageMeter usage={currentUsage} />
        </div>
        <div>
          <button type="submit" disabled={pending !== null || !ready || words === 0 || tooLong || freeUsedUp} className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50" data-testid="rewrite">
            {notes ? appCopy.notes.button : copy.button}
          </button>
          {ready && nextLocked ? (
            <p className="mt-2 text-sm text-fg-2" data-testid="next-locked">
              {appCopy.usage.nextLocked}
            </p>
          ) : null}
          {!ready ? (
            <p className="mt-2 text-sm text-fg-2" data-testid="needs-samples">
              {copy.needsMore(missing.samples, missing.words)}
            </p>
          ) : null}
          {/* Under Rewrite, as on the front page (Cam, 17 Oct). */}
          <p className="mt-3 text-sm text-fg-3" data-testid="not-stored">
            {copy.notStoredWithHistory}
          </p>
        </div>
      </form>

      {/* Outside the form: Subscribe is a form of its own, and forms cannot nest. */}
      {freeUsedUp ? (
        <div className="-mt-3 grid justify-items-start gap-2">
          <p className="text-sm text-fg-2" data-testid="free-used-up">
            {appCopy.usage.freeLine(currentUsage.used, currentUsage.max)}
          </p>
          {!paid && !resultSubscribes ? <SubscribeButton label={appCopy.locked.subscribe} className="btn btn-primary btn-sm" /> : null}
        </div>
      ) : null}
      {/* This tab's result only, straight under its button (Cam, 16 Oct). */}
      <div aria-live="polite" className="grid gap-4">
        {pending === mode ? <p className="text-fg-2">{copy.working}</p> : waitingHere ? <LockedWaiting /> : <Result state={tool.result} paid={paid} />}
      </div>
    </div>
  );
}

/** Try an example fills the box with a sample; Clear empties it (Cam, 16 Oct). */
export function ExampleButtons({ hasText, onExample, onClear }: { hasText: boolean; onExample: () => void; onClear: () => void }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={onExample} className="btn btn-quiet btn-sm">
        {appCopy.example.try}
      </button>
      {hasText ? (
        <button type="button" onClick={onClear} className="btn btn-quiet btn-sm">
          {appCopy.example.clear}
        </button>
      ) : null}
    </div>
  );
}

/** The limit message, with the exact credits when a paid draft needs more than are left. */
// Words are what the server counts; the message turns them into credits.
function limitMessage(state: Extract<ToolResult, { status: "limit" }>): string {
  if (state.limit === "free" || state.usage.tier !== "paid") return appCopy.limits.free;
  const needed = state.needed ?? limits.credits.minWords;
  if (state.limit === "daily") return appCopy.limits.daily(wordsLeft(state.usage.today), needed);
  return appCopy.limits.monthly(state.resetsAt, wordsLeft(state.usage.month), needed);
}

function Result({ state, paid }: { state: ToolResult; paid: boolean }) {
  switch (state.status) {
    case "idle":
      return null;
    case "unlocked":
      return (
        <div className="grid gap-4" data-testid="result">
          <h2 className="text-xl font-semibold tracking-tight">{state.mode === "notes" ? appCopy.result.notesHeading : appCopy.result.heading}</h2>
          <p className="text-sm text-fg-2">{appCopy.locked.opened}</p>
          <TextCard text={state.text} testId="result-text">
            <CopyButton text={state.text} />
          </TextCard>
        </div>
      );
    case "unlock_failed":
      return (
        <p role="alert" className="font-medium text-mark">
          {state.message}
        </p>
      );
    case "ok":
      return (
        <div className="grid gap-4" data-testid="result">
          <h2 className="text-xl font-semibold tracking-tight">{state.mode === "notes" ? appCopy.result.notesHeading : appCopy.result.heading}</h2>
          <TextCard text={state.text} testId="result-text">
            <CopyButton text={state.text} />
          </TextCard>
          <div className="grid gap-4 sm:grid-cols-2">
            <Changes lines={state.summary} />
            <Checks warnings={state.warnings} mode={state.mode} />
          </div>
        </div>
      );
    case "locked":
      return (
        <div className="grid gap-4" data-testid="locked">
          <h2 className="text-xl font-semibold tracking-tight">{appCopy.locked.heading}</h2>
          <p className="text-fg-2">{appCopy.locked.body}</p>
          <TextCard text={state.preview} testId="locked-preview" />
          {!paid ? (
            <div>
              <SubscribeButton label={appCopy.locked.subscribe} />
              <p className="mt-2 text-sm text-fg-2">{appCopy.locked.refund}</p>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Changes lines={state.summary} />
            <Checks warnings={state.warnings} mode={state.mode} />
          </div>
        </div>
      );
    case "limit":
      return (
        <div className="rounded-2xl border border-line-strong p-5" role="status" data-testid="limit">
          <p className="font-medium">
            {limitMessage(state)}
          </p>
          {state.limit === "free" && !paid ? (
            <div className="mt-4">
              <SubscribeButton label={appCopy.locked.subscribe} className="btn btn-primary btn-sm" />
              <p className="mt-2 text-sm text-fg-2">{appCopy.locked.refund}</p>
            </div>
          ) : null}
        </div>
      );
    case "busy":
      return (
        <div className="rounded-2xl border border-line-strong p-5">
          <p role="status" className="font-medium" data-testid="busy">
            {appCopy.limits.busy}
          </p>
          <ReadyMadeExamples />
        </div>
      );
    case "needs_samples":
      return (
        <p role="alert" className="font-medium text-mark">
          {appCopy.draft.needsSamples}
        </p>
      );
    case "error":
      return (
        <p role="alert" className="font-medium text-mark" data-testid="rewrite-error">
          {errorMessage(state.reason)}
        </p>
      );
  }
}
