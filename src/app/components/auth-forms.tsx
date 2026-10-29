"use client";

import { useActionState, useEffect, useRef } from "react";
import { deleteMyAccount, type FormState, signOut, startDemo } from "@/app/actions/auth";
import { authCopy } from "@/content/auth";
import { clearHistory } from "@/lib/history";
import { type Utm } from "@/lib/utm";
import { HONEYPOT_FIELD, MIN_FILL_MS } from "@/lib/waitlist-fields";

const idle: FormState = { status: "idle", message: "" };

// The server refuses demo sign-ins sent less than MIN_FILL_MS after the page was made (bots press at
// once). A person can press that fast too, so the form waits out the rest, plus a margin, first.
const HOLD_MS = MIN_FILL_MS + 400;

export function SignInForm({ formToken, next }: { formToken: string; next: string; utm?: Utm }) {
  const copy = authCopy.signIn;
  const shownAt = useRef(0);
  // A refreshed page hands the form a new token, so the wait restarts with it.
  useEffect(() => {
    shownAt.current = performance.now();
  }, [formToken]);
  const [state, action, pending] = useActionState(async (previous: FormState, form: FormData) => {
    const wait = HOLD_MS - (performance.now() - shownAt.current);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    return startDemo(previous, form);
  }, idle);

  return (
    <form action={action}>
      <input type="hidden" name="form_token" value={formToken} />
      <input type="hidden" name="next" value={next} />
      <div className="visually-hidden" aria-hidden="true">
        <label htmlFor={HONEYPOT_FIELD}>Leave this empty</label>
        <input id={HONEYPOT_FIELD} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <button
        type="submit"
        disabled={pending}
        data-testid="start-demo"
        className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-accent px-5 text-[1.0625rem] font-medium text-accent-ink hover:bg-accent-hover disabled:cursor-progress disabled:opacity-70"
      >
        {pending ? copy.pending : copy.button}
      </button>
      <p className="mt-3 px-1 text-[0.8125rem] text-fg-3">{copy.note}</p>
      <div aria-live="polite">
        {state.status === "error" ? (
          <p role="alert" className="mt-3 px-1 text-sm font-medium text-mark">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function DeleteAccountForm() {
  const copy = authCopy.account;
  const [state, action, pending] = useActionState(deleteMyAccount, idle);
  return (
    <form action={action} className="mt-5 grid gap-4">
      <label className="flex items-start gap-2.5 text-sm text-fg-2">
        <input type="checkbox" name="confirm" value="yes" className="mt-0.5 size-4 shrink-0 accent-[var(--mark)]" />
        {copy.deleteConfirm}
      </label>
      {state.status === "error" ? (
        <p id="delete-error" role="alert" className="text-sm font-medium text-mark">
          {state.message}
        </p>
      ) : null}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-sm border border-mark/40 text-mark hover:bg-mark-soft disabled:cursor-progress disabled:opacity-70"
        >
          {copy.deleteButton}
        </button>
      </div>
    </form>
  );
}

/** Sign out, clearing History from this browser first (it belongs to the account, Cam 16 Oct). */
export function SignOutButton({ label }: { label: string }) {
  return (
    <form action={signOut} onSubmit={() => clearHistory()}>
      <button type="submit" className="btn btn-quiet btn-sm">
        {label}
      </button>
    </form>
  );
}

/** On the page after deleting an account: History in this browser goes too. */
export function ClearHistoryOnLoad() {
  useEffect(() => clearHistory(), []);
  return null;
}
