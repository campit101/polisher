"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { type BillingState, openPortal, startCheckout } from "@/app/actions/billing";
import { billingCopy } from "@/content/billing";
import { askSession } from "@/lib/session-client";
import { type Utm } from "@/lib/utm";
import { CheckIcon } from "./icons";

const idle: BillingState = { message: "" };

export function SubscribeButton({ label, utm = {}, className = "btn btn-primary" }: { label: string; utm?: Utm; className?: string }) {
  const [state, action, pending] = useActionState(startCheckout, idle);
  return (
    <form action={action}>
      {Object.entries(utm).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <button type="submit" disabled={pending} className={className} data-testid="subscribe">
        {pending ? billingCopy.pending : label}
      </button>
      {state.message && (
        <p role="alert" className="mt-3 text-sm font-medium text-mark">
          {state.message}
        </p>
      )}
    </form>
  );
}

/**
 * The price card's button. Someone already subscribed sees "Subscribed" and a link to manage it
 * instead (Cam, 16 Oct); everyone else gets Subscribe. The page is built ahead of time, so it asks.
 */
export function PriceAction({
  label,
  subscribedLabel,
  manageLabel,
  utm,
  className,
  subscribed: known = false,
}: {
  label: string;
  subscribedLabel: string;
  manageLabel: string;
  utm?: Utm;
  className?: string;
  /** What the server already knows, so Subscribe never flashes first for a subscriber. */
  subscribed?: boolean;
}) {
  const [subscribed, setSubscribed] = useState(known);
  useEffect(() => {
    if (known) return;
    let live = true;
    void askSession().then((answer) => {
      if (live) setSubscribed(answer.subscribed);
    });
    return () => {
      live = false;
    };
  }, [known]);
  if (!subscribed) return <SubscribeButton label={label} utm={utm} className={className} />;
  return (
    <div className="grid justify-items-center gap-3">
      <p className="btn w-full cursor-default border border-accent-text/40 bg-accent-soft text-accent-text" data-testid="subscribed">
        <CheckIcon size={18} />
        {subscribedLabel}
      </p>
      <Link href="/account#billing" className="text-sm text-fg-2 hover:text-fg">
        {manageLabel}
      </Link>
    </div>
  );
}

export function ManageButton({ label }: { label: string }) {
  const [state, action, pending] = useActionState(openPortal, idle);
  return (
    <form action={action}>
      <button type="submit" disabled={pending} className="btn btn-quiet btn-sm" data-testid="manage">
        {pending ? billingCopy.pending : label}
      </button>
      {state.message && (
        <p role="alert" className="mt-3 text-sm font-medium text-mark">
          {state.message}
        </p>
      )}
    </form>
  );
}
