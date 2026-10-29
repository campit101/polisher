// Usage: every number used to meter AI use lives here. Customers see credits (DECISIONS.md "Launch
// direction", 16 Oct); the real AI cost of every call is still recorded as the internal ledger.
// Plain TypeScript with no imports, so the rewrite Edge Function (Deno) can use this same file.
// Money is counted in whole nano-dollars (1 USD = 1,000,000,000) so sums never drift.

export const NANO_PER_USD = 1_000_000_000;

export const usage = {
  // Demo (Cam, 29 Oct 2026): Claude Haiku 5.5, the cheapest model, measured at about 0.03p to 0.1p
  // a rewrite. Polisher ran on Sonnet 5.5 from 16 to 29 October.
  model: "claude-haiku-5-5",
  // USD per million tokens, Claude API reference cached 6 October 2026. Haiku 5.5 costs five times
  // as much past 100K prompt tokens; drafts are capped far below that.
  prices: {
    longContextThreshold: 100_000,
    standard: { input: 0.1, cacheWrite5m: 0.125, cacheWrite1h: 0.2, cacheRead: 0.01, output: 0.5 },
    longContext: { input: 0.5, cacheWrite5m: 0.625, cacheWrite1h: 1, cacheRead: 0.05, output: 2.5 },
  },
  // Other models, priced only to compare them with usage.model. Polisher's own calls never use them.
  comparePrices: {
    "claude-sonnet-5-5": { input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2, output: 10 },
  },
  // Paid plan (Cam, 16 Oct): credits charged by the exact word, 1 credit = 100 words, every rewrite
  // counting at least 50 words. 300 credits a billing month, at most 60 of them in a London day.
  // Failed rewrites use no credits.
  credits: { monthly: 300, daily: 60, wordsPerCredit: 100, minWords: 50 },
  // Free tier (launch decision 3): 3 rewrites in all, counted per account; the first two shown in full
  // (the signed-out free try counts as the first), the third run but locked until subscribing.
  // Free drafts up to 300 words, and at most $0.04 of AI cost an account (Cam, 16 Oct).
  free: { allowanceUsd: 0.04, maxRewrites: 3, shownRewrites: 2, draftMaxWords: 300 },
  // Demo (Cam, 29 Oct): a hard ceiling of about £0.10 on all AI spend in one UTC day, for everyone,
  // test subscribers included (anyone can subscribe with the test card). $0.13 is £0.097 at $1.34 to
  // £1 (25 Oct 2026). Never raise it without Cam's yes. Past it, visitors see ready-made examples.
  globalDailyCapUsd: 0.13,
  // Free rewrites (and the free try) may use the whole ceiling.
  globalFreeDailyCapUsd: 0.13,
  // Daily allowances reset at midnight here.
  timeZone: "Europe/London",
  // How long a locked free rewrite can be unlocked after subscribing.
  lockedRewriteHours: 24,
} as const;

/** Token counts as the Anthropic API reports them in `usage`. */
export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
};

const perTokenNano = (usdPerMillion: number) => Math.round(usdPerMillion * 1000);

/** Real cost of one API call in nano-dollars, from the token usage the API returned. */
export function callCostNano(u: TokenUsage, model: string = usage.model): number {
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const write1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  // Without a breakdown, cache writes are priced as 5-minute writes (the only kind Polisher asks for).
  const write5m = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : cacheWrite;
  const promptTokens = u.input_tokens + cacheWrite + cacheRead;
  const other = (usage.comparePrices as Record<string, (typeof usage.comparePrices)["claude-sonnet-5-5"]>)[model];
  if (model !== usage.model && !other) throw new Error(`No prices for ${model}`);
  const p = other ?? (promptTokens > usage.prices.longContextThreshold ? usage.prices.longContext : usage.prices.standard);
  return (
    u.input_tokens * perTokenNano(p.input) +
    write5m * perTokenNano(p.cacheWrite5m) +
    write1h * perTokenNano(p.cacheWrite1h) +
    cacheRead * perTokenNano(p.cacheRead) +
    u.output_tokens * perTokenNano(p.output)
  );
}

export const usdToNano = (usd: number) => Math.round(usd * NANO_PER_USD);
export const nanoToUsd = (nano: number) => nano / NANO_PER_USD;

export const freeLimitNano = () => usdToNano(usage.free.allowanceUsd);
export const globalDailyCapNano = () => usdToNano(usage.globalDailyCapUsd);
export const globalFreeDailyCapNano = () => usdToNano(usage.globalFreeDailyCapUsd);

/** Words a rewrite is charged: the draft's own words, but at least the minimum. */
export const chargedWords = (words: number) => Math.max(usage.credits.minWords, words);
/** Credits for a number of words (1 credit = 100 words), as a fraction. */
export const creditsOf = (words: number) => words / usage.credits.wordsPerCredit;
export const dailyWords = () => usage.credits.daily * usage.credits.wordsPerCredit;
export const monthlyWords = () => usage.credits.monthly * usage.credits.wordsPerCredit;

export type CreditCheck = { allowed: true } | { allowed: false; limit: "daily" | "monthly" };

/**
 * A paid rewrite starts only when both today's and this billing month's words cover it, so nobody
 * gets fewer credits than promised and nobody goes over. Nothing is ever cut off half way.
 */
export function checkCredits(usedTodayWords: number, usedThisPeriodWords: number, neededWords: number): CreditCheck {
  if (usedThisPeriodWords + neededWords > monthlyWords()) return { allowed: false, limit: "monthly" };
  if (usedTodayWords + neededWords > dailyWords()) return { allowed: false, limit: "daily" };
  return { allowed: true };
}

export type FreeCheck = { allowed: true; locked: boolean } | { allowed: false };

/** Free tier: the first two rewrites are shown, the third is run but locked, then no more. */
export function checkFree(freeRewritesUsed: number, freeCostNano: number): FreeCheck {
  if (freeRewritesUsed >= usage.free.maxRewrites || freeCostNano >= freeLimitNano()) return { allowed: false };
  return { allowed: true, locked: freeRewritesUsed >= usage.free.shownRewrites };
}

/** Minutes the zone is ahead of UTC at an instant (60 in British Summer Time, 0 in winter). */
function offsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((local - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** The instant midnight starts on the London calendar day that contains `now`. */
export function dayStart(now: Date, timeZone: string = usage.timeZone): Date {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const utcMidnight = Date.UTC(get("year"), get("month") - 1, get("day"));
  // UK clocks change at 01:00 UTC, so the offset at UTC midnight is the offset at local midnight.
  return new Date(utcMidnight - offsetMinutes(new Date(utcMidnight), timeZone) * 60_000);
}

/** When today's allowance resets: the next London midnight (25 hours away on 25 October). */
export function nextDayStart(now: Date, timeZone: string = usage.timeZone): Date {
  const start = dayStart(now, timeZone);
  // 26 hours past the start always lands on the next calendar day, even on a 25-hour day.
  return dayStart(new Date(start.getTime() + 26 * 3_600_000), timeZone);
}
