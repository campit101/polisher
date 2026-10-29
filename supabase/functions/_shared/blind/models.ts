// Blind comparison 2 (launch decision 1, Cam, 16 Oct): Claude Haiku 5.5 against Claude Sonnet 5.5
// through the same pipeline: the same voice-profile and rewrite prompts, the same samples, slang rules
// and clean-up. Only the model and its thinking settings change. Polisher ran on Sonnet 16 to 29 Oct and
// runs on Haiku again since (demo).
// Development only, polisher-test only (the blind-model function refuses any other project).
import { handleRewrite, type Store, type UsageRow } from "../rewrite/handler.ts";
import type { MeaningWarnings } from "../rewrite/meaning.ts";
import { type ApiMessage, samplesHash } from "../rewrite/prompts.ts";
import { callCostNano } from "../usage.ts";

export type CompareModel = "haiku" | "sonnet";
export const MODEL_IDS: Record<CompareModel, string> = { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5" };
export const isCompareModel = (value: unknown): value is CompareModel => value === "haiku" || value === "sonnet";

/**
 * The request a model gets, with each model's settings as measured on 16 Oct: Sonnet with thinking
 * "between_tools" (its thinking-off setting) at effort low; Haiku with thinking "disabled" (Haiku 5.5
 * accepts it at effort high or below) at effort medium, as Polisher sends it.
 */
export function forModel<T extends { model: string; thinking: unknown; output_config: object }>(body: T, model: CompareModel): T {
  if (model === "sonnet") return { ...body, model: MODEL_IDS.sonnet, thinking: { type: "between_tools" }, output_config: { ...body.output_config, effort: "low" } };
  return { ...body, model: MODEL_IDS.haiku, thinking: { type: "disabled" }, output_config: { ...body.output_config, effort: "medium" } };
}

export type CompareCall = { kind: UsageRow["kind"]; input_tokens: number; output_tokens: number; cache_write_tokens: number; cache_read_tokens: number };
export type CompareResult = {
  status: string;
  text?: string;
  /** The voice profile used, so the next draft can reuse it as a subscriber's account does. */
  profile?: string;
  /** Meaning items lost or changed (Check these), the "no critical meaning change" gate. */
  lost: { numbers: number; links: number; quotes: number };
  /** Added sentences and changed claims, reported but not a gate. */
  flagged: number;
  /** The full Check these and change summary, for the eval scripts (npm run eval:q1 and eval:rewrites). */
  warnings?: MeaningWarnings;
  summary?: string[];
  calls: CompareCall[];
  costNano: number;
  ms: number;
};

/**
 * One rewrite as Polisher makes it for a subscriber, on the chosen model: draft mode, no type, British
 * spelling, as the T9 pairs were made. A throwaway in-memory store stands in for the database: it holds
 * the samples, reuses a voice profile passed back from an earlier call (built on the same model) and
 * records each call so the cost can be priced on the right model.
 */
export async function compareRewrite(input: {
  ai: (body: unknown) => Promise<ApiMessage>;
  mock: boolean;
  samples: string[];
  draft: string;
  model: CompareModel;
  profile?: string;
  clock?: () => number;
}): Promise<CompareResult> {
  const clock = input.clock ?? (() => performance.now());
  const calls: CompareCall[] = [];
  const hash = await samplesHash(input.samples);
  let profile = input.profile;
  const store: Store = {
    aiMode: () => Promise.resolve(input.mock ? "mock" : "live"),
    withinRateLimit: () => Promise.resolve(true),
    samples: () => Promise.resolve(input.samples),
    styleProfile: () => Promise.resolve(profile ? { hash, profile } : null),
    saveStyleProfile: (_user, _hash, made) => {
      profile = made;
      return Promise.resolve();
    },
    paidPeriod: () => Promise.resolve({ start: new Date(Date.now() - 86_400_000), end: null }),
    spentNano: () => Promise.resolve(0),
    wordsCharged: () => Promise.resolve(0),
    globalSpentNano: () => Promise.resolve(0),
    tierSpentNano: () => Promise.resolve(0),
    // The comparison spends nothing against the demo ceiling: it runs on the test project only.
    reserveSpend: () => Promise.resolve(1),
    releaseSpend: () => Promise.resolve(),
    billedFailuresSince: () => Promise.resolve(0),
    freeRewritesUsed: () => Promise.resolve(0),
    claimFreeRewrite: () => Promise.resolve(1),
    releaseFreeRewrite: () => Promise.resolve(),
    recordUsage: (row) => {
      calls.push({ kind: row.kind, input_tokens: row.input_tokens, output_tokens: row.output_tokens, cache_write_tokens: row.cache_write_tokens, cache_read_tokens: row.cache_read_tokens });
      return Promise.resolve();
    },
    recordEvent: () => Promise.resolve(),
  };
  const ai = (body: unknown) => input.ai(forModel(body as Parameters<typeof forModel>[0], input.model));
  const started = clock();
  const result = await handleRewrite({ store, ai, lockSecret: "", now: () => new Date() }, "blind-model", input.draft, "draft");
  const ms = Math.round(clock() - started);
  const costNano = calls.reduce(
    (sum, c) =>
      sum +
      callCostNano(
        { input_tokens: c.input_tokens, output_tokens: c.output_tokens, cache_creation_input_tokens: c.cache_write_tokens, cache_read_input_tokens: c.cache_read_tokens },
        MODEL_IDS[input.model],
      ),
    0,
  );
  if (result.status !== "ok") {
    const status = result.status === "error" ? result.reason : result.status;
    return { status, ...(profile ? { profile } : {}), lost: { numbers: 0, links: 0, quotes: 0 }, flagged: 0, calls, costNano, ms };
  }
  const w = result.warnings;
  return {
    status: "ok",
    text: result.text,
    ...(profile ? { profile } : {}),
    lost: { numbers: w.numbers.length, links: w.links.length, quotes: w.quotationsChanged.length },
    flagged: w.added.length + w.claims.length,
    warnings: w,
    summary: result.summary,
    calls,
    costNano,
    ms,
  };
}
