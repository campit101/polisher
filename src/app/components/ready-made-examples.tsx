import { appCopy } from "@/content/app";
import { readyMadeExamples } from "@/content/examples";

/** Shown when the shared daily AI budget is used up (demo): real earlier output, never made up. */
export function ReadyMadeExamples() {
  const copy = appCopy.limits;
  return (
    <section aria-labelledby="ready-made-title" className="mt-4 grid gap-3" data-testid="ready-made-examples">
      <h3 id="ready-made-title" className="font-semibold">
        {copy.examplesTitle}
      </h3>
      <p className="text-sm text-fg-2">{copy.examplesNote}</p>
      {readyMadeExamples.map((example) => (
        <details key={example.id} className="rounded-2xl border border-line-strong p-4">
          <summary className="cursor-pointer font-medium">{example.title}</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-[0.8125rem] font-medium text-fg-3">{copy.exampleDraft}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-fg-2">{example.draft}</p>
            </div>
            <div>
              <p className="text-[0.8125rem] font-medium text-fg-3">{copy.exampleRewrite}</p>
              <p className="mt-1 whitespace-pre-line text-sm">{example.rewrite}</p>
            </div>
          </div>
        </details>
      ))}
    </section>
  );
}
