"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ui } from "@/content/ui";
import { askSession } from "@/lib/session-client";

/** Pages that know the answer pass it; public pages built ahead of time ask the server once. */
function useSignedIn(known: boolean | undefined): boolean {
  const [signedIn, setSignedIn] = useState(known ?? false);
  useEffect(() => {
    if (known !== undefined) return;
    let live = true;
    void askSession().then((answer) => {
      if (live) setSignedIn(answer.signedIn);
    });
    return () => {
      live = false;
    };
  }, [known]);
  return known ?? signedIn;
}

/** The logo: the Write page when signed in, otherwise the home page. */
export function HeaderLogo({ known, home, className, children }: { known?: boolean; home: string; className: string; children: ReactNode }) {
  const signedIn = useSignedIn(known);
  return (
    <Link href={signedIn ? "/app" : home} className={className}>
      {children}
    </Link>
  );
}

/** Write, History and Account when signed in; Sign in otherwise (unless the page is the sign-in page). */
export function HeaderAuthLinks({ known, signInHref, showSignIn }: { known?: boolean; signInHref: string; showSignIn: boolean }) {
  const signedIn = useSignedIn(known);
  const link = "mr-1 text-sm text-fg-2 no-underline hover:text-fg";
  if (signedIn)
    return (
      <>
        <Link href="/app" className={link}>
          {ui.nav.app}
        </Link>
        {/* Between Write and Account (Cam, 16 Oct). */}
        <Link href="/history" className={link}>
          {ui.nav.history}
        </Link>
        <Link href="/account" className={link}>
          {ui.nav.account}
        </Link>
      </>
    );
  return showSignIn ? (
    <Link href={signInHref} className={link}>
      {ui.nav.signIn}
    </Link>
  ) : null;
}
