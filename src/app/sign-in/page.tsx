import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authCopy } from "@/content/auth";
import { safeNext } from "@/lib/redirect";
import { requireEnv } from "@/lib/server/env";
import { currentUser } from "@/lib/supabase/server";
import { readUtm } from "@/lib/utm";
import { createFormToken } from "@/lib/waitlist";
import { SignInForm } from "../components/auth-forms";
import { SiteFooter, SiteHeader } from "../components/site-chrome";

export const metadata: Metadata = { title: authCopy.signIn.title };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  if (await currentUser()) redirect(next);
  const utm = readUtm(params);
  const copy = authCopy.signIn;

  return (
    <>
      <SiteHeader utm={utm} onLanding={false} signInLink={false} />
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pb-28 pt-20">
        <h1 className="title">{copy.heading}</h1>
        <p className="mt-4 text-lg text-fg-2">{copy.intro}</p>
        {params.error === "link" || params.error === "google" ? (
          <p role="alert" className="mt-6 rounded-xl border border-mark/40 bg-mark-soft px-4 py-3 text-sm text-fg">
            {copy.linkFailed}
          </p>
        ) : null}
        <div className="mt-8">
          <SignInForm formToken={createFormToken(requireEnv("IP_HASH_SALT"))} next={next} utm={utm} />
        </div>
        <p className="mt-6 text-[0.8125rem] text-fg-3">
          {copy.termsLead} <Link href="/terms">{copy.termsLink}</Link>. {copy.privacyLead} <Link href="/privacy">{copy.privacyLink}</Link>{" "}
          {copy.privacyTail}
        </p>
      </main>
      <SiteFooter utm={utm} />
    </>
  );
}
