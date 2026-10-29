import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import { appCopy } from "@/content/app";
import { linkSubscriptions } from "@/lib/server/account";
import { usageSummary } from "@/lib/server/rewrite";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { countWords } from "@/lib/words";
import { AddSampleForm, EditSampleForm, QuestionsForm, RewritePanel } from "../components/app-forms";
import { EditSamplesButton, SamplesDialog } from "../components/samples-dialog";
import { SiteFooter, SiteHeader } from "../components/site-chrome";
import { SubscribedNotice } from "../components/subscribed-notice";
import { TasteCarryOver } from "../components/taste-carry-over";

export const metadata: Metadata = { title: appCopy.title };

export default async function AppPage({ searchParams }: PageProps<"/app">) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/app");
  await linkSubscriptions(user);
  const params = await searchParams;
  const asked = params.samples === "1";

  // Samples are read as the user, so Row Level Security decides what is visible.
  const supabase = await supabaseServer();
  const [{ data: samples }, usage] = await Promise.all([
    supabase.from("writing_samples").select("id, body").order("created_at").order("id"),
    usageSummary(user),
  ]);
  const list = samples ?? [];
  const totalWords = list.reduce((sum, s) => sum + countWords(s.body), 0);
  const missingSamples = Math.max(0, site.samples.min - list.length);
  const missingWords = Math.max(0, site.samples.minTotalWords - totalWords);
  const ready = missingSamples === 0 && missingWords === 0;
  const emptySlots = Math.max(0, site.samples.max - list.length);
  // Below the minimum the pop-up opens on every visit, because rewriting waits for it. Above it,
  // empty slots are only a nudge: once a visit, never a block (Cam, 16 Oct).
  const autoOpen = asked || !ready ? "always" : emptySlots > 0 ? "once" : "never";
  const copy = appCopy.samples;

  return (
    <>
      <SiteHeader onLanding={false} signedIn />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-28 pt-10">
        {/* The tool is always at the top (Cam, 16 Oct); samples live in a pop-up. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{appCopy.heading}</h1>
          <EditSamplesButton count={list.length} />
        </div>
        {/* Straight after paying, Stripe's return trip lands here (Cam, 16 Oct). */}
        {params.subscribed === "1" && usage.tier === "paid" ? <SubscribedNotice /> : null}
        <section className="mt-6 rounded-2xl border border-line-strong bg-surface p-4 shadow-[var(--shadow)] sm:p-6">
          <RewritePanel userId={user.id} ready={ready} missing={{ samples: missingSamples, words: missingWords }} paid={usage.tier === "paid"} usage={usage} />
        </section>

        <SamplesDialog autoOpen={autoOpen}>
          <TasteCarryOver />
          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-lg font-semibold tracking-tight">{copy.heading}</h3>
            <span className="text-sm text-fg-2" data-testid="samples-progress">
              {copy.progress(list.length, totalWords)}
            </span>
          </div>
          <p className={`mt-1 text-sm ${ready ? "text-good" : "text-fg-2"}`} data-testid="samples-status">
            {ready ? copy.ready(emptySlots) : copy.needMore(missingSamples, missingWords)}
          </p>
          <p className="mt-4 text-fg-2">{copy.intro}</p>
          <ol className={list.length > 0 ? "mt-6 grid gap-6" : "hidden"}>
            {list.map((sample, i) => (
              <li key={sample.id}>
                <p className="mb-2 text-sm font-medium text-fg">{copy.sampleLabel(i + 1)}</p>
                <EditSampleForm id={sample.id} body={sample.body} index={i + 1} />
              </li>
            ))}
          </ol>
          <div className="mt-6">{list.length < site.samples.max ? <AddSampleForm /> : <p className="text-sm text-fg-2">{copy.full}</p>}</div>
          {list.length < site.samples.min ? (
            <details className="mt-8 border-t border-line pt-6" data-testid="questions">
              <summary className="cursor-pointer font-medium text-accent-text">{appCopy.questions.toggle}</summary>
              <QuestionsForm />
            </details>
          ) : null}
        </SamplesDialog>
      </main>
      <SiteFooter />
    </>
  );
}
