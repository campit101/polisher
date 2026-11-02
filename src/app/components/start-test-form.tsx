"use client";

import { useActionState } from "react";
import { type StartState, startKillTest } from "@/app/actions/admin";
import { adminCopy } from "@/content/admin";

const idle: StartState = { message: "" };

export function StartTestForm({ launched }: { launched: boolean }) {
  const copy = adminCopy.start;
  const [state, action, pending] = useActionState(startKillTest, idle);
  return (
    <form action={action} className="mt-5" data-testid="start-form">
      {!launched && (
        <p className="mb-4 rounded-xl bg-mark-soft px-4 py-3 text-sm text-fg" data-testid="not-launched">
          {copy.notLaunched}
        </p>
      )}
      <label className="flex items-start gap-3 text-sm text-fg-2">
        <input type="checkbox" name="confirm" value="yes" required disabled={!launched} className="mt-0.5 size-4 accent-[var(--accent)]" />
        <span>{copy.confirm}</span>
      </label>
      <button type="submit" disabled={!launched || pending} className="btn btn-primary mt-4" data-testid="start-test">
        {pending ? copy.pending : copy.button}
      </button>
      {state.message && (
        <p role="alert" className="mt-3 text-sm font-medium text-mark">
          {state.message}
        </p>
      )}
    </form>
  );
}
