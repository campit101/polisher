import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { killTest } from "@/config/kill-test";
import { isLaunched } from "@/config/site";
import { adminCopy } from "@/content/admin";
import { isAdmin } from "@/lib/admin";
import { FUNNEL_EVENTS, hoursLeft, loadDashboard } from "@/lib/server/kill-test";
import { currentUser } from "@/lib/supabase/server";
import { SiteFooter, SiteHeader } from "../components/site-chrome";
import { StartTestForm } from "../components/start-test-form";

// The title is given only to the admin, so a not-found page shown to anyone else carries no hint (T11).
export async function generateMetadata(): Promise<Metadata> {
  const user = await currentUser();
  return { ...(isAdmin(user?.email) ? { title: adminCopy.title } : {}), robots: { index: false, follow: false } };
}

const verdictTone = { pass: "text-good", fail: "text-mark", between: "text-fg" } as const;

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/admin");
  // Anyone else gets an ordinary "not found", so the page's existence is not confirmed.
  if (!isAdmin(user.email)) notFound();

  const copy = adminCopy;
  const { state, run, result, aiSpendTodayUsd, aiCapUsd, aiMode, aiFailuresToday } = await loadDashboard();
  const { signups, paid } = result;
  const status =
    state === "running" && run
      ? copy.status.running(run.endsAt, hoursLeft(run.endsAt))
      : state === "finished" && run
        ? copy.status.finished(run.endsAt)
        : copy.status.not_started;
  const reasons = (excluded: Record<string, number>) =>
    copy.leftOut(Object.entries(excluded).map(([key, count]) => [count, ...(copy.reasons[key] ?? [key, key])] as [number, string, string]));
  const aiPercent = Math.min(100, Math.round((aiSpendTodayUsd / aiCapUsd) * 100));

  return (
    <>
      <SiteHeader onLanding={false} signedIn />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 pb-28 pt-16">
        <h1 className="title">{copy.heading}</h1>
        <p className="mt-3 text-fg-2" data-testid="test-status">
          {status}
        </p>

        <section aria-labelledby="verdict-heading" className="mt-10 rounded-2xl border border-line bg-surface p-6">
          <h2 id="verdict-heading" className="text-sm text-fg-3">
            {copy.verdictLabel[state]}
          </h2>
          <p className={`mt-2 text-4xl font-semibold tracking-tight ${verdictTone[result.verdict]}`} data-testid="verdict">
            {copy.verdicts[result.verdict]}
          </p>
          <p className="mt-2 text-fg-2">{copy.verdictNotes[result.verdict]}</p>
          <p className="mt-4 text-sm text-fg-3">{copy.rules}</p>
        </section>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Target
            title={copy.signups}
            value={signups.counted}
            target={killTest.pass.minSignups}
            note={copy.signupsNote}
            leftOut={reasons(signups.excluded)}
            testId="signups"
          />
          <Target
            title={copy.paid}
            value={paid.counted}
            target={killTest.pass.minPaid}
            note={copy.paidNote}
            leftOut={reasons(paid.excluded)}
            testId="paid"
          />
        </div>

        {result.people ? (
          <section aria-labelledby="people-heading" className="mt-4 rounded-2xl border border-line bg-surface p-5">
            <h2 id="people-heading" className="font-medium text-fg">
              {copy.peopleTitle}
            </h2>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-fg" data-testid="people">
              {copy.people(result.people.total, result.people.today)}
            </p>
            <p className="mt-1 text-sm text-fg-3">{copy.peopleNote(result.people.uncounted)}</p>
          </section>
        ) : null}

        <section aria-labelledby="sources-heading" className="mt-12">
          <h2 id="sources-heading" className="text-xl font-semibold tracking-tight">
            {copy.sourcesTitle}
          </h2>
          <p className="mt-1 text-sm text-fg-3">{copy.sourcesNote}</p>
          {result.sources && result.sources.length > 0 ? (
            <table className="mt-4 w-full text-left text-sm" data-testid="sources">
              <thead>
                <tr className="border-b border-line text-fg-3">
                  {copy.sourcesHead.map((label, i) => (
                    <th key={label} scope="col" className={`py-2 font-normal ${i === 0 ? "pr-4" : "text-right"}`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.sources.map((row) => (
                  <tr key={row.source ?? "none"} className="border-b border-line">
                    <th scope="row" className="py-2.5 pr-4 font-normal text-fg-2">
                      {row.source ?? copy.sourcesDirect}
                    </th>
                    {[row.visits, row.people, row.signups, row.paid].map((value, i) => (
                      <td key={i} className="py-2.5 text-right font-medium tabular-nums text-fg">
                        {value.toLocaleString("en-GB")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-sm text-fg-2" data-testid="sources">
              {copy.sourcesEmpty}
            </p>
          )}
        </section>

        <section aria-labelledby="funnel-heading" className="mt-12">
          <h2 id="funnel-heading" className="text-xl font-semibold tracking-tight">
            {copy.funnelTitle}
          </h2>
          <p className="mt-1 text-sm text-fg-3">{copy.funnelNote}</p>
          <table className="mt-4 w-full text-left text-sm" data-testid="funnel">
            <tbody>
              {[
                ...FUNNEL_EVENTS.slice(0, 2).map((name) => [name, copy.funnel[name], result.funnel[name]] as const),
                ["signups", copy.funnel.signups, signups.counted] as const,
                ...FUNNEL_EVENTS.slice(2).map((name) => [name, copy.funnel[name], result.funnel[name]] as const),
                ["paid", copy.funnel.paid, paid.counted] as const,
              ].map(([key, label, value]) => (
                <tr key={key} className="border-b border-line">
                  <th scope="row" className="py-2.5 pr-4 font-normal text-fg-2">
                    {label}
                  </th>
                  <td className="py-2.5 text-right font-medium tabular-nums text-fg" data-testid={`funnel-${key}`}>
                    {value.toLocaleString("en-GB")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="ai-heading" className="mt-12 rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="ai-heading" className="font-medium text-fg">
              {copy.aiTitle}
            </h2>
            <span className="text-sm text-fg-2" data-testid="ai-spend">
              {copy.aiSpend(aiSpendTodayUsd, aiCapUsd)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={copy.aiTitle}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={aiPercent}
            aria-valuetext={copy.aiSpend(aiSpendTodayUsd, aiCapUsd)}
            className="mt-3 h-2 overflow-hidden rounded-full bg-raised ring-1 ring-line"
          >
            <div className={`h-full rounded-full ${aiPercent >= 100 ? "bg-mark" : "bg-accent"}`} style={{ width: `${aiPercent}%` }} />
          </div>
          <p className="mt-2 text-xs text-fg-3">{copy.aiNote}</p>
          <p className={`mt-2 text-sm ${aiFailuresToday > 0 ? "text-mark" : "text-fg-2"}`} data-testid="ai-failures">
            {copy.aiFailures(aiFailuresToday)}
          </p>
          <p className="mt-1 text-xs text-fg-3" data-testid="ai-mode">
            {copy.aiMode(aiMode)}
          </p>
        </section>

        <section aria-labelledby="blind-heading" className="mt-4 rounded-2xl border border-line bg-surface p-5">
          <h2 id="blind-heading" className="font-medium text-fg">
            {copy.blindLink.title}
          </h2>
          <p className="mt-1 text-sm text-fg-2">{copy.blindLink.note}</p>
          <Link href="/admin/blind" className="mt-3 inline-block text-sm font-medium text-accent-text hover:underline" data-testid="blind-link">
            {copy.blindLink.open}
          </Link>
        </section>

        {state === "not_started" && (
          <section aria-labelledby="start-heading" className="mt-12 rounded-2xl border border-line p-6">
            <h2 id="start-heading" className="text-lg font-semibold tracking-tight">
              {copy.start.title}
            </h2>
            <p className="mt-2 text-sm text-fg-2">{copy.start.intro}</p>
            <StartTestForm launched={isLaunched()} />
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

function Target({ title, value, target, note, leftOut, testId }: { title: string; value: number; target: number; note: string; leftOut: string; testId: string }) {
  const percent = Math.min(100, Math.round((value / target) * 100));
  const label = adminCopy.target(value, target);
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-sm text-fg-3">{title}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums" data-testid={testId}>
        {label}
      </p>
      <div
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={label}
        className="mt-3 h-2 overflow-hidden rounded-full bg-raised ring-1 ring-line"
      >
        <div className={`h-full rounded-full ${percent >= 100 ? "bg-good" : "bg-accent"}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-sm text-fg-2">{note}</p>
      <p className="mt-1 text-xs text-fg-3" data-testid={`${testId}-left-out`}>
        {leftOut}
      </p>
    </div>
  );
}
