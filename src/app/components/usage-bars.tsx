import { usage as limits } from "@/config/usage";
import { appCopy } from "@/content/app";
import type { UsageView } from "../../../supabase/functions/_shared/rewrite/handler.ts";

// Paid usage arrives in words charged against the words the credits allow (1 credit = 100 words).
type Count = { used: number; limit: number };

/** Words the credits still allow, never below zero. */
export const wordsLeft = (count: Count) => Math.max(0, count.limit - count.used);
/** Whole credits left, rounded down, so the page never shows more than there is. */
export const creditsLeft = (count: Count) => Math.floor(wordsLeft(count) / limits.credits.wordsPerCredit);
export const creditLimit = (count: Count) => Math.round(count.limit / limits.credits.wordsPerCredit);
/** The share left as a whole percentage, rounded down. */
export const shareLeft = (count: Count) => Math.floor((100 * wordsLeft(count)) / count.limit);
/** Nothing usable left: less than one minimum rewrite. */
export const usedUp = (count: Count) => wordsLeft(count) < limits.credits.minWords;

/** Credits left today and this month, or the free-trial line. */
export function UsageBars({ usage }: { usage: UsageView }) {
  const copy = appCopy.usage;
  if (usage.tier === "free") {
    return (
      <p className="text-sm text-fg-2" data-testid="free-usage">
        {copy.freeLine(usage.used, usage.max)}
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid="usage-bars">
      <Bar label={copy.today} count={usage.today} note={copy.todayResets} testId="usage-today" />
      <Bar label={copy.month} count={usage.month} note={copy.monthResets(usage.monthResetsAt)} testId="usage-month" />
    </div>
  );
}

/** A bar filled to the share that is left; it turns red once nothing usable is left. */
function Bar({ label, count, note, testId }: { label: string; count: Count; note: string; testId: string }) {
  const copy = appCopy.usage;
  const percent = shareLeft(count);
  const text = `${copy.percentLeft(percent)} ${copy.leftWord}, ${copy.creditsLine(creditsLeft(count), creditLimit(count))}`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-fg">{label}</span>
        <span className="text-fg-2" data-testid={testId}>
          {text}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={text}
        className="mt-2 h-2 overflow-hidden rounded-full bg-raised ring-1 ring-line"
      >
        <div className={`h-full rounded-full ${usedUp(count) ? "bg-mark" : "bg-accent"}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-fg-3">{note}</p>
    </div>
  );
}

/**
 * The Settings view (Cam, 16 Oct): one row per limit in the style of the usage card, with what it is
 * and when it resets on the left, the bar in the middle, and the share left large with whole credits
 * small on the right. Free accounts see their free rewrites instead.
 */
export function UsageRows({ usage }: { usage: UsageView }) {
  const copy = appCopy.usage;
  const rows =
    usage.tier === "free"
      ? [
          {
            label: copy.freeRewrites,
            note: copy.freeNote,
            percent: Math.round((100 * Math.min(usage.used, usage.max)) / usage.max),
            big: copy.freeCount(usage.used, usage.max),
            small: null,
            full: usage.used >= usage.max,
          },
        ]
      : (
          [
            [copy.today, copy.todayResets, usage.today],
            [copy.month, copy.monthResets(usage.monthResetsAt), usage.month],
          ] as const
        ).map(([label, note, count]) => ({
          label,
          note,
          percent: shareLeft(count),
          big: `${copy.percentLeft(shareLeft(count))} ${copy.leftWord}`,
          small: copy.creditsLine(creditsLeft(count), creditLimit(count)),
          full: usedUp(count),
        }));
  return (
    <div className="grid gap-6" data-testid="settings-usage">
      {rows.map((row) => (
        <div key={row.label} className="grid items-center gap-x-6 gap-y-2 sm:grid-cols-[11rem_1fr_7.5rem]">
          <div>
            <p className="flex items-center gap-2 font-medium">
              <span aria-hidden="true" className={`size-2.5 rounded-full ${row.full ? "bg-mark" : "bg-accent"}`} />
              {row.label}
            </p>
            <p className="mt-0.5 text-sm text-fg-3">{row.note}</p>
          </div>
          <div
            role="progressbar"
            aria-label={row.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={row.percent}
            aria-valuetext={row.small ? `${row.big}, ${row.small}` : row.big}
            className="h-2 overflow-hidden rounded-full bg-raised ring-1 ring-line"
          >
            <div className={`h-full rounded-full ${row.full ? "bg-mark" : "bg-accent"}`} style={{ width: `${row.percent}%` }} />
          </div>
          <div className="sm:text-right">
            <p className="text-lg font-semibold tracking-tight">{row.big}</p>
            {row.small ? <p className="text-sm text-fg-2">{row.small}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
