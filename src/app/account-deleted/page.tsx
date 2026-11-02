import type { Metadata } from "next";
import Link from "next/link";
import { authCopy } from "@/content/auth";
import { ClearHistoryOnLoad } from "../components/auth-forms";
import { SiteFooter, SiteHeader } from "../components/site-chrome";

export const metadata: Metadata = { title: authCopy.deleted.title };

export default function AccountDeletedPage() {
  const copy = authCopy.deleted;
  return (
    <>
      <SiteHeader onLanding={false} />
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pb-28 pt-24 text-center">
        <h1 className="title">{copy.heading}</h1>
        <p className="mt-4 text-lg text-fg-2">{copy.body}</p>
        <Link href="/" className="btn btn-quiet mt-8">
          {copy.home}
        </Link>
      </main>
      <SiteFooter />
      <ClearHistoryOnLoad />
    </>
  );
}
