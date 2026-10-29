import Link from "next/link";
import { site } from "@/config/site";
import { legalDocs } from "@/content/legal";
import { ui } from "@/content/ui";
import { type Utm, utmQuery } from "@/lib/utm";
import { HeaderAuthLinks, HeaderLogo } from "./header-auth";
import { LogoMark } from "./icons";
import { SettingsButton } from "./settings-dialog";

export function SiteHeader({
  utm = {},
  onLanding = true,
  signInLink = true,
  signedIn,
}: {
  utm?: Utm;
  onLanding?: boolean;
  signInLink?: boolean;
  /** Pages that check the session pass it; public pages leave it out and the header asks the server. */
  signedIn?: boolean;
}) {
  const home = `/${utmQuery(utm)}`;
  const anchor = (id: string) => (onLanding ? `#${id}` : `${home}#${id}`);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--canvas)_82%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <HeaderLogo known={signedIn} home={home} className="flex items-center gap-2.5 text-[1.0625rem] font-semibold tracking-tight text-fg no-underline">
          <LogoMark />
          {site.name}
          <span className="visually-hidden">{ui.nav.home}</span>
        </HeaderLogo>
        <nav aria-label="Main" className="ml-4 hidden items-center gap-7 text-sm md:flex">
          <a href={anchor("how")} className="text-fg-2 no-underline hover:text-fg">
            {ui.nav.how}
          </a>
          <a href={anchor("price")} className="text-fg-2 no-underline hover:text-fg">
            {ui.nav.price}
          </a>
          <a href={anchor("questions")} className="text-fg-2 no-underline hover:text-fg">
            {ui.nav.questions}
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <HeaderAuthLinks known={signedIn} signInHref={`/sign-in${utmQuery(utm)}`} showSignIn={signInLink} />
          <SettingsButton signedIn={signedIn} />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ utm = {} }: { utm?: Utm }) {
  const query = utmQuery(utm);
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-fg-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark size={22} />
          <p className="text-fg-2">{ui.footer.by}</p>
        </div>
        <nav aria-label={ui.footer.legal} className="flex flex-wrap gap-x-6 gap-y-2">
          {legalDocs.map((doc) => (
            <Link key={doc.slug} href={`/${doc.slug}${query}`} className="text-fg-3 no-underline hover:text-fg">
              {doc.title}
            </Link>
          ))}
          <a href={`mailto:${ui.footer.contact}`} className="text-fg-3 no-underline hover:text-fg">
            {ui.footer.contact}
          </a>
        </nav>
      </div>
      {/* The trader's address, which UK law wants on the site, in small print in the right-hand corner
          of its own strip at the very bottom of every page, as dim as the 4.5:1 contrast floor allows
          (Cam, 16 Oct: it is a home address). It must stay readable to meet the law. */}
      {ui.footer.address ? (
        <div className="border-t border-line">
          <p className="mx-auto max-w-6xl px-5 py-3 text-right text-[0.625rem] text-[var(--fine-print)]" data-testid="footer-address">
            {ui.footer.address}
          </p>
        </div>
      ) : null}
    </footer>
  );
}
