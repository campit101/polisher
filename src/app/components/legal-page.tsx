import type { LegalDoc } from "@/content/legal";
import { SiteFooter, SiteHeader } from "./site-chrome";

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <>
      <SiteHeader onLanding={false} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-28 pt-16">
        <h1 className="title">{doc.title}</h1>
        <p className="mt-3 text-fg-2">
          {doc.summary} Last updated {doc.updated}.
        </p>
        <div className="mt-6">
          {doc.sections.map((section) => (
            <section key={section.heading} className="border-t border-line pt-7 mt-8">
              <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-3 max-w-[68ch] leading-relaxed text-fg-2">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
