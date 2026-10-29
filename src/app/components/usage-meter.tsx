"use client";

// Usage behind a small ring beside the tool (Cam, 16 Oct): the ring
// fills with the credits left today; a click opens a card with today and this month. Never money.
import { useEffect, useRef, useState } from "react";
import { appCopy } from "@/content/app";
import type { UsageView } from "../../../supabase/functions/_shared/rewrite/handler.ts";
import { CloseIcon } from "./icons";
import { creditLimit, creditsLeft, shareLeft, usedUp } from "./usage-bars";

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function UsageMeter({ usage }: { usage: UsageView }) {
  const copy = appCopy.usage;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const left = usage.tier === "paid" ? shareLeft(usage.today) : Math.round((100 * Math.max(0, usage.max - usage.used)) / usage.max);
  const label = usage.tier === "paid" ? copy.meterPaid(left) : copy.meterFree(Math.max(0, usage.max - usage.used), usage.max);

  // Closes on Escape or a click anywhere else.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const onClick = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="usage-popover"
        aria-label={label}
        className="inline-flex size-10 items-center justify-center rounded-xl border border-line bg-raised transition-transform hover:border-line-strong active:scale-90"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="-rotate-90">
          <circle cx="12" cy="12" r={RADIUS} fill="none" stroke="var(--line-strong)" strokeWidth="3" />
          <circle
            cx="12"
            cy="12"
            r={RADIUS}
            fill="none"
            stroke={left <= 0 ? "var(--mark)" : "var(--accent)"}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - left / 100)}
          />
        </svg>
      </button>
      <div
        id="usage-popover"
        hidden={!open}
        className="absolute bottom-full right-0 z-30 mb-3 w-[min(22rem,calc(100vw-3rem))] rounded-2xl border border-line-strong bg-surface p-5 shadow-[var(--shadow)]"
        data-testid="usage-popover"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold tracking-tight">{copy.heading}</h3>
          <button type="button" onClick={() => setOpen(false)} className="inline-flex size-8 items-center justify-center rounded-full text-fg-2 hover:bg-raised hover:text-fg">
            <CloseIcon />
            <span className="visually-hidden">{copy.close}</span>
          </button>
        </div>
        {usage.tier === "paid" ? (
          <div className="mt-4 grid grid-cols-2 divide-x divide-line">
            <Column title={copy.today} count={usage.today} note={copy.todayResets} testId="usage-today" />
            <Column title={copy.month} count={usage.month} note={copy.monthResets(usage.monthResetsAt)} testId="usage-month" className="pl-4" />
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            {/* The same big-number style as the paid card. */}
            <p data-testid="free-left">
              <span className="text-3xl font-semibold tracking-tight">{copy.freeLeft(Math.max(0, usage.max - usage.used), usage.max)}</span>{" "}
              <span className="text-fg-2">{copy.freeLeftWord}</span>
            </p>
            <p className="text-sm text-fg-2" data-testid="free-usage">
              {copy.freeLine(usage.used, usage.max)}
            </p>
            <p className="text-sm text-fg-3">{copy.freeNote}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Cam's mock-up (16 Oct): the share left large, whole credits small underneath, then the reset. */
function Column({ title, count, note, testId, className = "" }: { title: string; count: { used: number; limit: number }; note: string; testId: string; className?: string }) {
  const copy = appCopy.usage;
  const percent = shareLeft(count);
  return (
    <div className={`pr-4 ${className}`}>
      <p className="flex items-center gap-2 text-sm text-fg-2">
        <span aria-hidden="true" className={`size-2.5 rounded-full ${usedUp(count) ? "bg-mark" : "bg-accent"}`} />
        {title}
      </p>
      <p className="mt-2" data-testid={testId}>
        <span className="text-4xl font-semibold tracking-tight">{copy.percentLeft(percent)}</span> <span className="text-lg text-fg-2">{copy.leftWord}</span>
      </p>
      <p className="text-sm text-fg-2" data-testid={`${testId}-credits`}>
        {copy.creditsLine(creditsLeft(count), creditLimit(count))}
      </p>
      <p className="mt-2 text-sm text-fg-3">{note}</p>
    </div>
  );
}
