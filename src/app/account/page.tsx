import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authCopy } from "@/content/auth";
import { isPaidStatus, isStillBilling } from "@/lib/billing";
import { accountName, linkSubscriptions } from "@/lib/server/account";
import { usageSummary } from "@/lib/server/rewrite";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { DeleteAccountForm, SignOutButton } from "../components/auth-forms";
import { ManageButton, SubscribeButton } from "../components/billing-buttons";
import { UserIcon } from "../components/icons";
import { SiteFooter, SiteHeader } from "../components/site-chrome";
import { UsageBars } from "../components/usage-bars";

export const metadata: Metadata = { title: authCopy.account.title };

const ukDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/account");
  await linkSubscriptions(user);

  // Read as the user, so Row Level Security decides what is visible.
  const supabase = await supabaseServer();
  const [usage, subscription, samples, name] = await Promise.all([
    usageSummary(user),
    supabase
      .from("subscriptions")
      .select("status, started_at, current_period_end, cancel_at_period_end")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("writing_samples").select("id", { count: "exact", head: true }),
    accountName(user),
  ]);
  const copy = authCopy.account;
  const sub = subscription.data;
  const paid = !!sub && isPaidStatus(sub.status);
  const canSubscribe = !sub || !isStillBilling(sub.status);
  const periodEnd = paid && sub.current_period_end ? ukDate(sub.current_period_end) : null;
  const fullName = [name.first_name, name.last_name].filter(Boolean).join(" ");
  const initials = [name.first_name, name.last_name].map((part) => part.charAt(0).toUpperCase()).join("");

  return (
    <>
      <SiteHeader onLanding={false} signedIn />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-28 pt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="title">{copy.title}</h1>
          <SignOutButton label={copy.signOut} />
        </div>

        {/* Who you are and which plan you are on (Cam, 16 Oct). */}
        <section aria-label={copy.title} className="mt-8 flex flex-wrap items-center gap-4 rounded-2xl border border-line-strong bg-surface p-5 shadow-[var(--shadow)]">
          <span aria-hidden="true" className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-lg font-semibold text-accent-text">
            {initials || <UserIcon size={24} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold tracking-tight" data-testid="account-name">
              {fullName || copy.addName}
            </p>
            <p className="text-sm break-all text-fg-2">
              {copy.signedInAs} <span className="font-medium text-fg" data-testid="account-email">{user.email}</span>
            </p>
            {fullName ? null : <p className="mt-1 text-sm text-fg-3">{copy.addNameHint}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-fg-3">{copy.planTitle}</p>
            <p
              className={`mt-1 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${paid ? "bg-accent text-accent-ink" : "border border-line-strong text-fg"}`}
              data-testid="plan"
            >
              {paid ? copy.planPro : copy.planFree}
            </p>
          </div>
        </section>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <section id="billing" aria-labelledby="subscription-heading" className="flex flex-col rounded-2xl border border-line bg-surface p-5">
            <h2 id="subscription-heading" className="text-sm text-fg-3">
              {copy.subscriptionTitle}
            </h2>
            <p className="mt-2 text-lg font-semibold tracking-tight" data-testid="subscription">
              {sub ? (
                <>
                  {copy.statusLabels[sub.status] ?? sub.status}
                  <span className="mt-1 block text-sm font-normal text-fg-3" data-testid="subscription-date">
                    {periodEnd ? (sub.cancel_at_period_end ? copy.ends(periodEnd) : copy.renews(periodEnd)) : copy.since(ukDate(sub.started_at))}
                  </span>
                </>
              ) : (
                <span className="text-base font-normal text-fg-2">{copy.noSubscription}</span>
              )}
            </p>
            <div className="mt-auto grid gap-4 pt-5">
              {canSubscribe && (
                <div>
                  <SubscribeButton label={copy.subscribe} className="btn btn-primary btn-sm" />
                  <p className="mt-2 text-sm text-fg-3">{copy.subscribeNote}</p>
                </div>
              )}
              {sub && (
                <div>
                  <ManageButton label={copy.manage} />
                  <p className="mt-2 text-sm text-fg-3">{copy.manageNote}</p>
                </div>
              )}
            </div>
          </section>

          <section aria-labelledby="samples-heading" className="flex flex-col rounded-2xl border border-line bg-surface p-5">
            <h2 id="samples-heading" className="text-sm text-fg-3">
              {copy.samplesTitle}
            </h2>
            <p className="mt-2 text-lg font-semibold tracking-tight" data-testid="samples">
              {copy.samplesCount(samples.count ?? 0)}
            </p>
            <p className="mt-1 text-sm text-fg-3">{copy.samplesNote}</p>
            <div className="mt-auto pt-5">
              <Link href="/app?samples=1" className="btn btn-quiet btn-sm">
                {copy.samplesButton}
              </Link>
            </div>
          </section>
        </div>

        <section aria-labelledby="usage-heading" className="mt-4 rounded-2xl border border-line bg-surface p-5" data-testid="usage">
          <h2 id="usage-heading" className="mb-4 text-sm text-fg-3">
            {paid ? copy.usageTitle : copy.freeTitle}
          </h2>
          <UsageBars usage={usage} />
        </section>

        <section aria-labelledby="data-heading" className="mt-14 border-t border-line pt-8">
          <h2 id="data-heading" className="text-xl font-semibold tracking-tight">
            {copy.dataTitle}
          </h2>
          <p className="mt-2 text-fg-2">{copy.dataIntro}</p>
          <a href="/account/export" download className="btn btn-quiet btn-sm mt-5">
            {copy.download}
          </a>
        </section>

        <section aria-labelledby="delete-heading" className="mt-12 rounded-2xl border border-line p-6">
          <h2 id="delete-heading" className="text-lg font-semibold tracking-tight">
            {copy.deleteTitle}
          </h2>
          <p className="mt-2 text-sm text-fg-2">{copy.deleteIntro}</p>
          <DeleteAccountForm />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
