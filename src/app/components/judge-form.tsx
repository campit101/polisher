"use client";

import { useActionState } from "react";
import { type JudgeState, judgePair } from "@/app/actions/admin";
import { adminCopy } from "@/content/admin";

const idle: JudgeState = { message: "" };

/** The two "I'd send" buttons for one blind pair. Both are off while a choice is saving. */
export function JudgeForm({ setName, pairId }: { setName: string; pairId: number }) {
  const copy = adminCopy.blind;
  const [state, action, pending] = useActionState(judgePair, idle);
  return (
    <form action={action} className="mt-6" data-testid="judge-form">
      <input type="hidden" name="set" value={setName} />
      <input type="hidden" name="id" value={pairId} />
      <div className="grid gap-3 sm:grid-cols-2">
        {(["a", "b"] as const).map((side) => (
          <button key={side} type="submit" name="winner" value={side} disabled={pending} className="btn btn-primary" data-testid={`choose-${side}`}>
            {pending ? copy.pending : copy.choose[side]}
          </button>
        ))}
      </div>
      {state.message && (
        <p role="alert" className="mt-3 text-sm font-medium text-mark">
          {state.message}
        </p>
      )}
    </form>
  );
}
