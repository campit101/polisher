import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminCopy } from "@/content/admin";
import { isAdmin } from "@/lib/admin";
import { isModelCompareSet, modelVerdict, setNameFrom } from "@/lib/blind";
import { loadBlind } from "@/lib/server/blind";
import { currentUser } from "@/lib/supabase/server";
import { JudgeForm } from "../../components/judge-form";
import { SiteFooter, SiteHeader } from "../../components/site-chrome";

// The title is given only to the admin, as on /admin (T11).
export async function generateMetadata(): Promise<Metadata> {
  const user = await currentUser();
  return { ...(isAdmin(user?.email) ? { title: adminCopy.blind.title } : {}), robots: { index: false, follow: false } };
}

const verdictTone = { pass: "text-good", stop: "text-mark", write_why: "text-fg", in_progress: "text-fg", switch: "text-good", keep: "text-fg" } as const;

export default async function BlindPage({ searchParams }: PageProps<"/admin/blind">) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/admin/blind");
  // Same rule as /admin: anyone else gets an ordinary "not found".
  if (!isAdmin(user.email)) notFound();

  const copy = adminCopy.blind;
  // Browser tests pass their own set; Cam always sees the real one.
  const setName = setNameFrom((await searchParams).set);
  const view = await loadBlind(setName);
  // Blind comparison 2 (Haiku against Sonnet) uses its own wording and switch rule.
  const models = isModelCompareSet(setName) ? copy.models : null;
  const result =
    view.state !== "done"
      ? null
      : models
        ? (() => {
            const verdict = modelVerdict(view.baselineWins, view.total);
            return { verdict, label: models.verdicts[verdict], wins: models.wins(view.baselineWins, view.polisherWins, view.total), note: models.verdictNotes[verdict], rules: models.rules };
          })()
        : { verdict: view.verdict, label: copy.verdicts[view.verdict], wins: copy.wins(view.polisherWins, view.total), note: copy.verdictNotes[view.verdict], rules: copy.rules };
  const sources = models?.sources ?? copy.sources;

  return (
    <>
      <SiteHeader onLanding={false} signedIn />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-28 pt-16">
        <Link href="/admin" className="text-sm text-fg-3 hover:text-fg">
          {copy.back}
        </Link>
        <h1 className="title mt-3">{models?.heading ?? copy.heading}</h1>
        <p className="mt-3 max-w-3xl text-fg-2">{models?.intro ?? copy.intro}</p>

        {view.state === "empty" && (
          <p className="mt-10 rounded-2xl border border-line bg-surface p-6 text-fg-2" data-testid="blind-empty">
            {copy.empty}
          </p>
        )}

        {view.state === "judging" && (
          <section aria-labelledby="pair-heading" className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="pair-heading" className="text-xl font-semibold tracking-tight" data-testid="pair-number">
                {copy.pair(view.next.number, view.total)}
              </h2>
              <span className="text-sm text-fg-2" data-testid="blind-progress">
                {copy.progress(view.judged, view.total)}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={copy.progress(view.judged, view.total)}
              aria-valuemin={0}
              aria-valuemax={view.total}
              aria-valuenow={view.judged}
              className="mt-3 h-2 overflow-hidden rounded-full bg-raised ring-1 ring-line"
            >
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((view.judged / view.total) * 100)}%` }} />
            </div>
            <p className="mt-6 text-lg font-medium text-fg">{copy.question}</p>
            <p className="mt-1 text-sm text-fg-3">{copy.final}</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {(
                [
                  ["a", view.next.textA],
                  ["b", view.next.textB],
                ] as const
              ).map(([side, text]) => (
                <article key={side} aria-labelledby={`version-${side}`} className="rounded-2xl border border-line bg-surface p-5">
                  <h3 id={`version-${side}`} className="text-sm font-medium text-fg-3">
                    {copy.version[side]}
                  </h3>
                  <div className="mt-3 font-serif text-[1.0625rem] leading-relaxed whitespace-pre-wrap break-words text-fg" data-testid={`text-${side}`}>
                    {text}
                  </div>
                </article>
              ))}
            </div>
            <JudgeForm key={view.next.id} setName={setName} pairId={view.next.id} />
          </section>
        )}

        {view.state === "done" && result && (
          <>
            <section aria-labelledby="blind-result-heading" className="mt-10 rounded-2xl border border-line bg-surface p-6">
              <h2 id="blind-result-heading" className="text-sm text-fg-3">
                {copy.resultLabel}
              </h2>
              <p className={`mt-2 text-4xl font-semibold tracking-tight ${verdictTone[result.verdict]}`} data-testid="blind-verdict">
                {result.label}
              </p>
              <p className="mt-2 text-fg" data-testid="blind-wins">
                {result.wins}
              </p>
              <p className="mt-1 text-fg-2">{result.note}</p>
              <p className="mt-4 text-sm text-fg-3">{result.rules}</p>
            </section>
            <section aria-labelledby="choices-heading" className="mt-12">
              <h2 id="choices-heading" className="text-xl font-semibold tracking-tight">
                {copy.choicesTitle}
              </h2>
              <table className="mt-4 w-full text-left text-sm" data-testid="blind-choices">
                <thead>
                  <tr className="border-b border-line text-fg-3">
                    <th scope="col" className="py-2 pr-4 font-normal">
                      {copy.columns.pair}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-normal">
                      {copy.columns.draft}
                    </th>
                    <th scope="col" className="py-2 font-normal">
                      {copy.columns.chose}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.choices.map((c) => (
                    <tr key={c.number} className="border-b border-line">
                      <td className="py-2.5 pr-4 tabular-nums text-fg-2">{c.number}</td>
                      <td className="py-2.5 pr-4 text-fg-2">{c.draftId ?? ""}</td>
                      <td className={`py-2.5 font-medium ${c.chose === "polisher" ? "text-fg" : "text-fg-2"}`}>{sources[c.chose]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
