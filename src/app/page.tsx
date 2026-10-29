import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { polish, summariseReport } from "@polish/index.ts";
import { STOCK_PHRASES } from "@polish/stock-phrases.ts";
import { site } from "@/config/site";
import { appCopy } from "@/content/app";
import { landing, specimen } from "@/content/landing";
import { isStillBilling } from "@/lib/billing";
import { requireEnv } from "@/lib/server/env";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { readUtm } from "@/lib/utm";
import { createFormToken } from "@/lib/waitlist";
import { PriceAction } from "./components/billing-buttons";
import { CheckIcon, ClipboardIcon, DocIcon, PenIcon, PlusIcon, SparkIcon } from "./components/icons";
import { SiteFooter, SiteHeader } from "./components/site-chrome";
import { ViewBeacon } from "./components/view-beacon";
import { VioletHaze } from "./components/violet-haze";
import { TasteTool } from "./components/taste-tool";
import { KINDS } from "../../supabase/functions/_shared/rewrite/kinds.ts";

// The "after" pane is produced by the real post-processor, not typed by hand.
const draft = specimen.map((s) => s.text).join("");
const cleaned = polish(draft);
const changes = summariseReport(cleaned.report);
const counts = [null, STOCK_PHRASES.length, null];
const stepIcons = [PenIcon, ClipboardIcon, SparkIcon];

// What search results and shared links show. The image is ./opengraph-image.tsx.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", siteName: site.name, locale: "en_GB", title: landing.title, description: landing.description },
  twitter: { card: "summary_large_image", title: landing.title, description: landing.description },
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const utm = readUtm(await searchParams);
  const formToken = createFormToken(requireEnv("IP_HASH_SALT"));
  // Known on the server, so the tool, header and price card arrive right and nothing flashes (16 Oct).
  // A visitor whose session needs refreshing reads as signed out here; the page then asks /api/session.
  const user = await currentUser();
  let subscribed = false;
  if (user) {
    const { data } = await (await supabaseServer()).from("subscriptions").select("status");
    subscribed = (data ?? []).some((row) => isStillBilling(row.status));
  }
  let tellIndex = 0;

  return (
    <>
      <SiteHeader utm={utm} signedIn={user ? true : undefined} />
      <main className="flex-1">
        {/* Hero: the tool first (R1), headline on the left and the free taste on the right, over the
            violet haze (Cam, 17 Oct), which spans the full width below the header. */}
        <div className="polisher-violet-haze-host pb-8">
          <VioletHaze />
          <section aria-labelledby="hero-heading" className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-12 sm:pt-16 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
            <div>
              <h1 id="hero-heading" className="headline max-w-[14ch]">
                {landing.hero.heading}
              </h1>
              {/* The students line sits by the price only (Cam, 17 Oct). */}
              <p className="mt-5 max-w-[34rem] text-lg text-fg-2 sm:text-xl sm:leading-relaxed" data-testid="hero-intro">
                {landing.hero.intro}
              </p>
              {/* The "first rewrite is free, then £5" line came out so the tool sits closer (Cam, 19 Oct);
                  the price card and the tool's own messages still say both. */}
            </div>
            <TasteTool formToken={formToken} utm={utm} signedIn={user !== null} />
          </section>
        </div>

        {/* Product window: the signature moment */}
        <section aria-label={landing.hero.windowTitle} className="relative mx-auto mt-28 max-w-6xl px-5 sm:mt-32">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-10 -top-10 bottom-10 -z-10 rounded-[3rem] blur-3xl"
            style={{ background: "radial-gradient(60% 60% at 50% 40%, var(--glow), transparent 70%)" }}
          />
          <figure className="demo">
            <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[var(--shadow)]">
              <div className="flex h-11 items-center gap-2 border-b border-line px-4" aria-hidden="true">
                <span className="size-3 rounded-full bg-[#ff5f57]" />
                <span className="size-3 rounded-full bg-[#febc2e]" />
                <span className="size-3 rounded-full bg-[#28c840]" />
                <span className="mx-auto pr-12 text-[0.8125rem] font-medium text-fg-3">{landing.hero.windowTitle}</span>
              </div>
              <div className="grid lg:grid-cols-2">
                <div className="border-b border-line p-5 sm:p-7 lg:border-b-0 lg:border-r">
                  <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-fg-3">
                    <DocIcon size={16} />
                    {landing.hero.beforeLabel}
                  </p>
                  <div
                    data-testid="specimen-before"
                    className="mt-4 rounded-xl border border-line bg-canvas p-5 font-serif text-[1.0625rem] leading-[1.75] whitespace-pre-wrap"
                  >
                    {specimen.map((segment, i) =>
                      segment.tell ? (
                        <del key={i} className="tell" style={{ "--i": tellIndex++ } as CSSProperties}>
                          {segment.text}
                        </del>
                      ) : (
                        <span key={i}>{segment.text}</span>
                      ),
                    )}
                  </div>
                </div>
                <div className="p-5 sm:p-7">
                  <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-accent-text">
                    <SparkIcon size={16} />
                    {landing.hero.afterLabel}
                  </p>
                  <div
                    data-testid="specimen-after"
                    className="mt-4 rounded-xl border border-line bg-canvas p-5 font-serif text-[1.0625rem] leading-[1.75] whitespace-pre-wrap"
                  >
                    {cleaned.text}
                  </div>
                  <p className="visually-hidden">{landing.hero.changesPrefix}</p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {changes.map((line) => (
                      <li
                        key={line}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1 text-[0.8125rem] text-fg-2"
                      >
                        <CheckIcon size={14} className="text-good" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <figcaption className="mx-auto mt-5 max-w-[46rem] text-center text-sm text-fg-3">{landing.hero.caption}</figcaption>
          </figure>
          {site.demoVideo ? (
            <video className="mt-10 w-full rounded-2xl border border-line" controls preload="none" poster={site.demoVideo.poster}>
              <source src={site.demoVideo.src} type="video/mp4" />
            </video>
          ) : null}
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-heading" className="mx-auto max-w-6xl px-5 pt-32">
          <h2 id="how-heading" className="title max-w-[18ch]">
            {landing.steps.heading}
          </h2>
          <ol className="mt-12 grid overflow-hidden rounded-2xl border border-line md:grid-cols-3">
            {landing.steps.items.map((step, i) => {
              const StepIcon = stepIcons[i] ?? SparkIcon;
              return (
                <li key={step.title} className="border-line p-7 max-md:border-b max-md:last:border-b-0 md:border-r md:last:border-r-0">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
                      <StepIcon size={20} />
                    </span>
                    <span className="text-sm font-medium text-fg-3" aria-hidden="true">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-6 text-lg font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-fg-2">{step.body}</p>
                </li>
              );
            })}
          </ol>
          {/* What each draft type is for, here rather than in ? badges on the tool (Cam, 16 Oct). */}
          <div className="mt-16" data-testid="kind-explained">
            <h3 className="text-xl font-semibold tracking-tight">{landing.steps.kindsHeading}</h3>
            <p className="mt-2 max-w-[40rem] text-fg-2">{landing.steps.kindsIntro}</p>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              {KINDS.map((kind) => (
                <div key={kind} className="rounded-2xl border border-line bg-surface p-5">
                  <dt className="font-semibold tracking-tight">{appCopy.kinds[kind]}</dt>
                  <dd className="mt-1.5 text-fg-2">{appCopy.kinds.help[kind]}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* What it takes out */}
        <section id="removes" aria-labelledby="removes-heading" className="mx-auto max-w-6xl px-5 pt-32">
          <h2 id="removes-heading" className="title max-w-[18ch]">
            {landing.removes.heading}
          </h2>
          <dl className="mt-12 grid gap-x-10 gap-y-12 md:grid-cols-3">
            {landing.removes.items.map((item, i) => (
              <div key={item.title} className="border-t border-line-strong pt-6">
                <dt className="text-lg font-semibold tracking-tight">{item.title}</dt>
                <dd className="mt-2 text-fg-2">{item.body.replace("{count}", String(counts[i] ?? ""))}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Price */}
        <section id="price" aria-labelledby="price-heading" className="mx-auto max-w-6xl px-5 pt-32">
          <div className="text-center">
            <h2 id="price-heading" className="title">
              {landing.pricing.heading}
            </h2>
            <p className="mx-auto mt-4 max-w-[30rem] text-lg text-fg-2">{landing.pricing.intro}</p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-accent-text/40 bg-accent-soft px-4 py-1.5 text-sm font-medium text-accent-text" data-testid="students">
              <SparkIcon size={15} />
              {landing.pricing.students}
            </p>
          </div>
          <div className="mx-auto mt-12 max-w-[26rem]">
            <div className="rounded-2xl border border-line-strong bg-surface p-7 shadow-[var(--shadow)]">
              <p className="text-sm font-medium text-fg-2">{landing.pricing.planName}</p>
              <p className="mt-3 flex items-baseline gap-2" data-testid="price">
                <span className="text-5xl font-semibold tracking-tight">{landing.pricing.amount}</span>{" "}
                <span className="text-fg-2">{landing.pricing.period}</span>
              </p>
              <ul className="mt-6 grid gap-3 border-t border-line pt-6">
                {landing.pricing.points.map((point) => (
                  <li key={point} className="flex gap-3 text-[0.9375rem]">
                    <CheckIcon size={18} className="mt-0.5 shrink-0 text-accent-text" />
                    {point}
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                <PriceAction
                  label={landing.pricing.cta}
                  subscribedLabel={landing.pricing.subscribed}
                  manageLabel={landing.pricing.manage}
                  utm={utm}
                  subscribed={subscribed}
                  className="btn btn-primary w-full"
                />
              </div>
              <p className="mt-3 text-center text-[0.8125rem] text-fg-3">{landing.pricing.note}</p>
            </div>
          </div>
        </section>

        {/* Questions */}
        <section id="questions" aria-labelledby="faq-heading" className="faq mx-auto max-w-3xl px-5 py-32">
          <h2 id="faq-heading" className="title text-center">
            {landing.faq.heading}
          </h2>
          <div className="mt-12 divide-y divide-line border-y border-line">
            {landing.faq.items.map((item) => (
              <details key={item.q}>
                <summary className="flex items-center justify-between gap-6 py-5 text-[1.0625rem] font-medium">
                  {item.q}
                  <PlusIcon size={18} className="plus shrink-0 text-fg-3" />
                </summary>
                <p className="pb-6 pr-10 text-fg-2">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter utm={utm} />
      <ViewBeacon name="landing_view" />
    </>
  );
}
