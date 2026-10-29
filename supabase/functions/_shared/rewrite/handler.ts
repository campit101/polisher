// What happens on each rewrite and unlock request. The database and the AI are passed in, so the
// whole flow is unit tested with fakes; supabase/functions/rewrite/index.ts wires in the real ones.
import { addRemoved, polish, type PolishReport, type Spelling, stripHidden, summariseReport } from "../polish/index.ts";
import {
  callCostNano,
  chargedWords,
  checkCredits,
  checkFree,
  dailyWords,
  dayStart,
  globalDailyCapNano,
  globalFreeDailyCapNano,
  monthlyWords,
  NANO_PER_USD,
  nextDayStart,
  type TokenUsage,
  usage,
} from "../usage.ts";
import { limits, countWords } from "./limits.ts";
import { maskPreview, openLocked, sealLocked } from "./locked.ts";
import { fixFormal, isFormalKind, isKind, type Kind } from "./kinds.ts";
import { checkAdded, checkMeaning, draftSideOnly, type MeaningWarnings } from "./meaning.ts";
import { type AiFailure, type ApiMessage, type Mode, MODES, type Parsed, parseProfile, parseRewrite, profileRequest, rewriteRequest, samplesHash } from "./prompts.ts";
import { allowedSlang, replaceAddedSlang, slangUsedOften } from "./slang.ts";

export type { Mode };

export type Tier = "free" | "paid";
export type CallKind = "style_profile" | "rewrite";

export interface UsageRow {
  /** Null for the free taste without an account (R1). */
  user_id: string | null;
  kind: CallKind;
  tier: Tier;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  /** Exact to the nano-dollar, as a decimal string for numeric(14,9). The internal ledger. */
  cost_usd: string;
  outcome: "ok" | "error" | "mock";
  /** Words the customer was charged (1 credit = 100 words, at least 50 a rewrite): only on a successful paid rewrite, 0 on every other row. */
  charged_words: number;
}

export interface Store {
  aiMode(): Promise<"live" | "mock">;
  withinRateLimit(key: string, windowSeconds: number, max: number): Promise<boolean>;
  /** The user's samples, oldest first. */
  samples(userId: string): Promise<string[]>;
  styleProfile(userId: string): Promise<{ hash: string; profile: string } | null>;
  saveStyleProfile(userId: string, hash: string, profile: string): Promise<void>;
  /** The current billing month of a subscription with the paid allowance, or null. */
  paidPeriod(userId: string): Promise<{ start: Date; end: Date | null } | null>;
  /** Cost of successful calls (and mock calls on the test project) since a moment. */
  spentNano(userId: string, tier: Tier, since: Date): Promise<number>;
  /** Words the user's successful paid rewrites were charged since a moment. */
  wordsCharged(userId: string, since: Date): Promise<number>;
  /** Cost of every AI call by anyone since a moment, for the global daily ceiling. */
  globalSpentNano(since: Date): Promise<number>;
  /** Cost of every AI call on one tier, by anyone, since a moment. */
  tierSpentNano(tier: Tier, since: Date): Promise<number>;
  /**
   * Atomically reserves an amount against the daily ceiling (spend since a moment plus open
   * reservations plus this amount must stay within the cap). The reservation id, or null if refused.
   */
  reserveSpend(since: Date, capNano: number, amountNano: number): Promise<number | null>;
  releaseSpend(id: number): Promise<void>;
  /** The user's failed AI calls that still cost something, since a moment. */
  billedFailuresSince(userId: string, since: Date): Promise<number>;
  freeRewritesUsed(userId: string): Promise<number>;
  /** Atomically takes one free rewrite; the new count, or null if none were left. */
  claimFreeRewrite(userId: string, max: number): Promise<number | null>;
  releaseFreeRewrite(userId: string): Promise<void>;
  recordUsage(row: UsageRow): Promise<void>;
  recordEvent(name: string): Promise<void>;
}

/** Sends one Messages API request. Throws on network or HTTP errors. */
export type Ai = (body: unknown) => Promise<ApiMessage>;

export interface Deps {
  store: Store;
  ai: Ai;
  /** Server-only secret the locked-rewrite key is derived from. */
  lockSecret: string;
  now: () => Date;
}

export type UsageView =
  // Paid usage in words charged against the words the credits allow (1 credit = 100 words).
  | { tier: "paid"; today: { used: number; limit: number }; month: { used: number; limit: number }; dayResetsAt: string; monthResetsAt: string | null }
  | { tier: "free"; used: number; max: number; shown: number };

export type { Kind, Spelling };
const isSpelling = (value: unknown): value is Spelling => value === "uk" || value === "us";

export type RewriteResult =
  | { status: "ok"; mode: Mode; kind?: Kind; text: string; report: PolishReport; summary: string[]; warnings: MeaningWarnings; usage: UsageView }
  // The detailed report lists words from the rewrite, so a locked result carries only the count lines.
  | { status: "locked"; mode: Mode; kind?: Kind; preview: string; token: string; expiresAt: string; summary: string[]; warnings: MeaningWarnings; usage: UsageView }
  // needed: the words this draft would be charged, when that is more than what is left (paid only).
  | { status: "limit"; limit: "daily" | "monthly" | "free"; resetsAt: string | null; needed?: number; usage: UsageView }
  | { status: "needs_samples" }
  | { status: "busy" }
  // free_too_long: free drafts are capped at usage.free.draftMaxWords (300) words (Cam, 16 Oct).
  | { status: "error"; reason: "empty" | "too_long" | "free_too_long" | "rate_limited" | AiFailure | "ai_unavailable" };

export type UnlockResult = { status: "ok"; text: string } | { status: "not_subscribed" } | { status: "expired" } | { status: "rate_limited" };

const EPOCH = new Date(0);
const toUsd = (nano: number) => `${Math.floor(nano / NANO_PER_USD)}.${String(nano % NANO_PER_USD).padStart(9, "0")}`;

/** UTC midnight, where the global ceiling resets (the database sums in UTC). */
const utcDayStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export function paidView(now: Date, today: number, month: number, periodEnd: Date | null): UsageView {
  return {
    tier: "paid",
    today: { used: today, limit: dailyWords() },
    month: { used: month, limit: monthlyWords() },
    dayResetsAt: nextDayStart(now).toISOString(),
    monthResetsAt: periodEnd?.toISOString() ?? null,
  };
}

const freeView = (used: number): UsageView => ({ tier: "free", used, max: usage.free.maxRewrites, shown: usage.free.shownRewrites });

// Test project only (app_settings ai_mode = mock): no paid AI is called. The mock rewrite adds one to
// the first number in the draft, so the meaning warnings show up in tests; "MOCK_REFUSE" gets a refusal.
function mockMessage(kind: CallKind, body: { messages: { content: string }[] }): ApiMessage {
  const input = body.messages[0]?.content ?? "";
  const draft = input.replace(/^<draft>\n/, "").replace(/\n<\/draft>$/, "");
  const text =
    kind === "style_profile"
      ? "Mock voice profile: short, plain sentences, a warm tone, contractions and few commas."
      : JSON.stringify({ rewrite: draft.replace(/\d+/, (n) => String(Number(n) + 1)) });
  const tokens = (s: string) => Math.ceil(s.length / 4);
  return {
    content: [{ type: "text", text }],
    stop_reason: kind === "rewrite" && draft.includes("MOCK_REFUSE") ? "refusal" : "end_turn",
    usage: { input_tokens: tokens(input) + 400, output_tokens: tokens(text) },
  };
}

type ApiBody = ReturnType<typeof profileRequest> | ReturnType<typeof rewriteRequest>;

/**
 * Sends one AI call (or the mock on the test project) and records it with its real cost. Every call
 * counts towards the global ceiling; only successful ones count against a person's allowance, and a
 * successful paid rewrite carries the words it was charged.
 */
function makeCaller(deps: Deps, mock: boolean, userId: string | null, tier: Tier, words = 0) {
  let spent = 0;
  const call = async (kind: CallKind, body: ApiBody, parse: (m: ApiMessage) => Parsed): Promise<Parsed | null> => {
    let message: ApiMessage;
    try {
      message = mock ? mockMessage(kind, body) : await deps.ai(body);
    } catch {
      await deps.store.recordUsage({ user_id: userId, kind, tier, input_tokens: 0, output_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0, cost_usd: "0.000000000", outcome: "error", charged_words: 0 });
      return null;
    }
    const parsed = parse(message);
    const cost = callCostNano(message.usage);
    const u: TokenUsage = message.usage;
    await deps.store.recordUsage({
      user_id: userId,
      kind,
      tier,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_write_tokens: u.cache_creation_input_tokens ?? 0,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
      cost_usd: toUsd(cost),
      outcome: !parsed.ok ? "error" : mock ? "mock" : "ok",
      charged_words: parsed.ok && kind === "rewrite" && tier === "paid" ? words : 0,
    });
    if (parsed.ok) spent += cost;
    return parsed;
  };
  return { call, spent: () => spent };
}

/** Everything after the AI: slang, careful writing, clean-up, the change report and Check these. */
function finish(draft: string, cleaned: { hidden: number; markers: number }, aiText: string, aiFormal: boolean | undefined, samples: string[], kind?: Kind, spelling: Spelling = "uk") {
  const meaning = checkMeaning(draft, aiText);
  // The type the user chose decides how careful the writing must be; without one, the AI's own call (Q5).
  const formal = kind ? isFormalKind(kind) : aiFormal !== false;
  // Slang the person does not use often, and any slang in a formal message, comes out even if the
  // AI added it (Q5). The draft's own slang always stays.
  const plainer = replaceAddedSlang(aiText, allowedSlang(samples, draft, formal));
  // Email, Work and Article: capitals, I, apostrophes and abbreviations made sure of in code (15 Oct).
  const careful = kind ? fixFormal(plainer.text, draft, kind) : { text: plainer.text, count: 0 };
  // British by default; American when the person chose it in Settings (Cam, 16 Oct).
  const polished = polish(careful.text, spelling);
  const text = polished.text;
  // Numbers, links and quotations are checked before the clean-up (so its own changes are never
  // flagged); added content on the final text, so it never quotes words the fixes took out.
  const warnings: MeaningWarnings = { ...meaning, ...checkAdded(draft, text) };
  const report = addRemoved(polished.report, cleaned);
  const summary = summariseReport(report);
  if (plainer.count > 0) summary.push(`${plainer.count} slang ${plainer.count === 1 ? "word" : "words"} taken out`);
  if (careful.count > 0) summary.push(`${careful.count} capitals, apostrophes or abbreviations fixed`);
  return { text, report, summary, warnings };
}

// The most one request can cost: both calls at their output limits, with every input character
// counted as half a token (real text is about four characters a token). Reserved before the calls so
// the daily ceiling is hard even when many requests arrive at once (audit, 29 Oct).
export function worstCaseNano(inputChars: number): number {
  return callCostNano({ input_tokens: Math.ceil(inputChars / 2) + 6000, output_tokens: 1024 + 8192 });
}

// Hidden characters are removed before the real caps apply, so a raw paste may be longer than
// draftMaxChars, but never more than twice as long.
const RAW_MAX_CHARS = limits.draftMaxChars * 2;

export async function handleRewrite(deps: Deps, userId: string, pasted: string, mode: Mode = "draft", kind?: Kind, spelling: Spelling = "uk"): Promise<RewriteResult> {
  const { store } = deps;
  // A paste far over the cap is refused before any work that grows with its size (audit, 29 Oct).
  if (pasted.length > RAW_MAX_CHARS) return { status: "error", reason: "too_long" };
  // Hidden characters and chat citation leftovers never reach the AI; the report counts them.
  const cleaned = stripHidden(pasted);
  const draft = cleaned.text;
  const now = deps.now();
  const words = countWords(draft);
  if (words === 0) return { status: "error", reason: "empty" };
  if (words > limits.draftMaxWords || draft.length > limits.draftMaxChars) return { status: "error", reason: "too_long" };
  if (!(await store.withinRateLimit(`rewrite:${userId}`, 3600, limits.rewritesPerHour))) return { status: "error", reason: "rate_limited" };
  if (!(await store.withinRateLimit(`rewrite-burst:${userId}`, limits.burst.windowSeconds, limits.burst.max))) return { status: "error", reason: "rate_limited" };
  if ((await store.billedFailuresSince(userId, dayStart(now))) >= limits.billedFailuresPerDay) return { status: "error", reason: "rate_limited" };

  const samples = await store.samples(userId);
  if (samples.length < limits.samplesMin || countWords(samples.join(" ")) < limits.samplesMinTotalWords) return { status: "needs_samples" };

  // Allowance checks come first, so nothing is spent once a limit is reached.
  // Demo (Cam, 29 Oct): the shared daily ceiling covers everyone, test subscribers included.
  if ((await store.globalSpentNano(utcDayStart(now))) >= globalDailyCapNano()) return { status: "busy" };
  const period = await store.paidPeriod(userId);
  const tier: Tier = period ? "paid" : "free";
  if (!period && words > usage.free.draftMaxWords) return { status: "error", reason: "free_too_long" };
  const needed = chargedWords(words);
  let today = 0;
  let month = 0;
  if (period) {
    [today, month] = await Promise.all([store.wordsCharged(userId, dayStart(now)), store.wordsCharged(userId, period.start)]);
    const check = checkCredits(today, month, needed);
    if (!check.allowed) {
      const resetsAt = check.limit === "daily" ? nextDayStart(now).toISOString() : (period.end?.toISOString() ?? null);
      return { status: "limit", limit: check.limit, resetsAt, needed, usage: paidView(now, today, month, period.end) };
    }
  } else {
    const [used, freeNano] = await Promise.all([store.freeRewritesUsed(userId), store.spentNano(userId, "free", EPOCH)]);
    if (!checkFree(used, freeNano).allowed) return { status: "limit", limit: "free", resetsAt: null, usage: freeView(used) };
    // The free share of the ceiling (the whole ceiling in the demo) covers free use.
    if ((await store.tierSpentNano("free", utcDayStart(now))) >= globalFreeDailyCapNano()) return { status: "busy" };
  }

  const reservation = await store.reserveSpend(utcDayStart(now), globalDailyCapNano(), worstCaseNano(draft.length + samples.join("").length));
  if (reservation === null) return { status: "busy" };
  try {
    let claimed = 0;
    if (!period) {
      const count = await store.claimFreeRewrite(userId, usage.free.maxRewrites);
      if (count === null) return { status: "limit", limit: "free", resetsAt: null, usage: freeView(usage.free.maxRewrites) };
      claimed = count;
    }

    const caller = makeCaller(deps, (await store.aiMode()) === "mock", userId, tier, needed);
    const call = caller.call;
    const fail = async (reason: AiFailure | "ai_unavailable"): Promise<RewriteResult> => {
      if (!period) await store.releaseFreeRewrite(userId);
      return { status: "error", reason };
    };

    const hash = await samplesHash(samples);
    const cached = await store.styleProfile(userId);
    let profile = cached?.hash === hash ? cached.profile : undefined;
    if (!profile) {
      const made = await call("style_profile", profileRequest(samples), parseProfile);
      if (!made) return fail("ai_unavailable");
      if (!made.ok) return fail(made.reason);
      profile = made.text;
      await store.saveStyleProfile(userId, hash, profile);
    }

    const rewritten = await call("rewrite", rewriteRequest(profile, draft, mode, slangUsedOften(samples), kind, spelling), (m) => parseRewrite(m, draft, mode));
    if (!rewritten) return fail("ai_unavailable");
    if (!rewritten.ok) return fail(rewritten.reason);

    const { text, report, summary, warnings } = finish(draft, cleaned, rewritten.text, rewritten.formal, samples, kind, spelling);
    const typed = kind ? { kind } : {};

    if (period) {
      await store.recordEvent("paid_rewrite");
      return { status: "ok", mode, ...typed, text, report, summary, warnings, usage: paidView(now, today + needed, month + needed, period.end) };
    }
    if (claimed <= usage.free.shownRewrites) {
      await store.recordEvent("free_rewrite_shown");
      return { status: "ok", mode, ...typed, text, report, summary, warnings, usage: freeView(claimed) };
    }
    await store.recordEvent("free_rewrite_locked");
    const lifetimeMs = usage.lockedRewriteHours * 3_600_000;
    // Added content quotes the rewrite, so a locked result carries only how many there are.
    const { warnings: draftSide, hidden } = draftSideOnly(warnings);
    if (hidden > 0) summary.push(`${hidden} added or changed ${hidden === 1 ? "part" : "parts"} to check once it's unlocked`);
    return {
      status: "locked",
      mode,
      ...typed,
      preview: maskPreview(text),
      token: await sealLocked(deps.lockSecret, { userId, text, now, lifetimeMs }),
      expiresAt: new Date(now.getTime() + lifetimeMs).toISOString(),
      summary,
      warnings: draftSide,
      usage: freeView(claimed),
    };
  } finally {
    await store.releaseSpend(reservation);
  }
}

export type FunctionRequest =
  | { action: "rewrite"; draft: string; mode: Mode; kind?: Kind; spelling?: Spelling }
  | { action: "unlock"; token: string }
  // The free taste (R1): sent by the website's server with the project's secret key, never by a browser.
  | { action: "taste"; draft: string; mode: Mode; samples: string[]; kind?: Kind; spelling?: Spelling };

/**
 * Checks the body the website sends. A missing mode means draft and a missing type means none, so
 * older callers keep working; an unknown mode or type is refused.
 */
export function parseRequest(input: unknown): FunctionRequest | null {
  if (typeof input !== "object" || input === null) return null;
  const { action, draft, token, mode = "draft", kind, spelling } = input as Record<string, unknown>;
  if ((kind !== undefined && !isKind(kind)) || (spelling !== undefined && !isSpelling(spelling))) return null;
  const extras = { ...(kind !== undefined ? { kind: kind as Kind } : {}), ...(spelling !== undefined ? { spelling: spelling as Spelling } : {}) };
  if (action === "rewrite" && typeof draft === "string" && (MODES as readonly unknown[]).includes(mode)) return { action, draft, mode: mode as Mode, ...extras };
  if (action === "unlock" && typeof token === "string") return { action, token };
  const { samples } = input as Record<string, unknown>;
  if (action === "taste" && typeof draft === "string" && (MODES as readonly unknown[]).includes(mode) && Array.isArray(samples) && samples.length <= 10 && samples.every((x) => typeof x === "string")) {
    return { action, draft, mode: mode as Mode, samples: samples as string[], ...extras };
  }
  return null;
}

export type TasteRequest = { samples: string[]; draft: string; mode: Mode; kind?: Kind; spelling?: Spelling };
export type TasteResult =
  | { status: "ok"; mode: Mode; kind?: Kind; text: string; report: PolishReport; summary: string[]; warnings: MeaningWarnings }
  | { status: "needs_samples" }
  | { status: "busy" }
  | { status: "error"; reason: "empty" | "too_long" | "free_too_long" | "rate_limited" | AiFailure | "ai_unavailable" };

/**
 * One free rewrite without an account (R1). The voice comes from the visitor's answers to the
 * own-words questions, which are not stored; the cost is recorded with no account on the free tier,
 * so the free share of the daily ceiling covers it. The website limits each connection and asks for
 * a bot check before it calls this.
 */
export async function handleTaste(deps: Deps, request: TasteRequest): Promise<TasteResult> {
  const { store } = deps;
  if (request.draft.length > RAW_MAX_CHARS) return { status: "error", reason: "too_long" };
  const cleaned = stripHidden(request.draft);
  const draft = cleaned.text;
  const now = deps.now();
  const words = countWords(draft);
  if (words === 0) return { status: "error", reason: "empty" };
  if (words > limits.draftMaxWords || draft.length > limits.draftMaxChars) return { status: "error", reason: "too_long" };
  if (words > usage.free.draftMaxWords) return { status: "error", reason: "free_too_long" };
  const samples = request.samples.map((answer) => stripHidden(answer).text.trim()).filter(Boolean);
  if (samples.length > limits.taste.maxAnswers || samples.some((s) => countWords(s) > limits.sampleMaxWords || s.length > limits.sampleMaxChars)) {
    return { status: "error", reason: "too_long" };
  }
  if (samples.length < limits.taste.minAnswers || countWords(samples.join(" ")) < limits.taste.minWords) return { status: "needs_samples" };
  if ((await store.globalSpentNano(utcDayStart(now))) >= globalDailyCapNano()) return { status: "busy" };
  if ((await store.tierSpentNano("free", utcDayStart(now))) >= globalFreeDailyCapNano()) return { status: "busy" };
  if (!(await store.withinRateLimit("taste-global", 3600, limits.taste.globalPerHour))) return { status: "error", reason: "rate_limited" };

  const reservation = await store.reserveSpend(utcDayStart(now), globalDailyCapNano(), worstCaseNano(draft.length + samples.join("").length));
  if (reservation === null) return { status: "busy" };
  try {
    const { call } = makeCaller(deps, (await store.aiMode()) === "mock", null, "free");
    const made = await call("style_profile", profileRequest(samples), parseProfile);
    if (!made) return { status: "error", reason: "ai_unavailable" };
    if (!made.ok) return { status: "error", reason: made.reason };
    const { mode, kind, spelling = "uk" } = request;
    const rewritten = await call("rewrite", rewriteRequest(made.text, draft, mode, slangUsedOften(samples), kind, spelling), (m) => parseRewrite(m, draft, mode));
    if (!rewritten) return { status: "error", reason: "ai_unavailable" };
    if (!rewritten.ok) return { status: "error", reason: rewritten.reason };
    const { text, report, summary, warnings } = finish(draft, cleaned, rewritten.text, rewritten.formal, samples, kind, spelling);
    await store.recordEvent("taste_completed");
    return { status: "ok", mode, ...(kind ? { kind } : {}), text, report, summary, warnings };
  } finally {
    await store.releaseSpend(reservation);
  }
}

/** Shows a locked rewrite once the account is subscribed and the token is under 24 hours old. */
export async function handleUnlock(deps: Deps, userId: string, token: string): Promise<UnlockResult> {
  if (!(await deps.store.withinRateLimit(`unlock:${userId}`, 3600, limits.unlocksPerHour))) return { status: "rate_limited" };
  if (!(await deps.store.paidPeriod(userId))) return { status: "not_subscribed" };
  const text = await openLocked(deps.lockSecret, token, userId, deps.now());
  if (text === null) return { status: "expired" };
  await deps.store.recordEvent("locked_rewrite_unlocked");
  return { status: "ok", text };
}
