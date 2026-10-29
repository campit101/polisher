import { beforeEach, describe, expect, it } from "vitest";
import { usage } from "../usage.ts";
import { limits } from "./limits.ts";
import { type Ai, type Deps, handleRewrite, handleTaste, handleUnlock, parseRequest, type Store, type Tier, type UsageRow } from "./handler.ts";
import type { ApiMessage } from "./prompts.ts";

const NOW = new Date("2026-10-13T12:00:00Z");
const SECRET = "unit-test-lock-secret";
const sample = (n: number) => `Sample ${n}. ` + Array(110).fill("word").join(" ");
const draft = 'Hi Jo,\n\nMoreover, the color scheme costs £450 and "we will leverage the data" as agreed. Thanks for organizing it all.';

class FakeStore implements Store {
  mode: "live" | "mock" = "live";
  rateOk = true;
  rateBlocked: string[] = [];
  rateCalls: [string, number, number][] = [];
  billedFailures = 0;
  billedFailuresFrom: Date | null = null;
  freeGlobal = 0;
  sampleList = [sample(1), sample(2), sample(3)];
  profile: { hash: string; profile: string } | null = null;
  period: { start: Date; end: Date | null } | null = null;
  spent: Record<Tier, number> = { free: 0, paid: 0 };
  wordsToday = 0;
  wordsMonth = 0;
  wordsFrom: Date[] = [];
  global = 0;
  freeUsed = 0;
  usageRows: UsageRow[] = [];
  events: string[] = [];
  releases = 0;
  aiMode = () => Promise.resolve(this.mode);
  withinRateLimit = (key: string, windowSeconds: number, max: number) => {
    this.rateCalls.push([key, windowSeconds, max]);
    return Promise.resolve(this.rateOk && !this.rateBlocked.some((prefix) => key.startsWith(prefix)));
  };
  samples = () => Promise.resolve(this.sampleList);
  styleProfile = () => Promise.resolve(this.profile);
  saveStyleProfile = (_u: string, hash: string, profile: string) => {
    this.profile = { hash, profile };
    return Promise.resolve();
  };
  paidPeriod = () => Promise.resolve(this.period);
  spentNano = (_u: string, tier: Tier) => Promise.resolve(this.spent[tier]);
  wordsCharged = (_u: string, since: Date) => {
    this.wordsFrom.push(since);
    return Promise.resolve(since.getTime() > (this.period?.start.getTime() ?? 0) ? this.wordsToday : this.wordsMonth);
  };
  globalSpentNano = () => Promise.resolve(this.global);
  // Spend reservations for the hard daily ceiling (audit, 29 Oct), summed like the database does.
  reservations = new Map<number, number>();
  reservedTotal = () => [...this.reservations.values()].reduce((sum, n) => sum + n, 0);
  reserveCalls: { cap: number; amount: number }[] = [];
  reserveSpend = (_since: Date, cap: number, amount: number) => {
    this.reserveCalls.push({ cap, amount });
    if (this.global + this.reservedTotal() + amount > cap) return Promise.resolve(null);
    const id = this.reservations.size + this.reserveCalls.length;
    this.reservations.set(id, amount);
    return Promise.resolve(id);
  };
  releaseSpend = (id: number) => {
    this.reservations.delete(id);
    return Promise.resolve();
  };
  tierSpentNano = (tier: Tier) => Promise.resolve(tier === "free" ? this.freeGlobal : 0);
  billedFailuresSince = (_u: string, since: Date) => {
    this.billedFailuresFrom = since;
    return Promise.resolve(this.billedFailures);
  };
  freeRewritesUsed = () => Promise.resolve(this.freeUsed);
  claimFreeRewrite = (_u: string, max: number) => Promise.resolve(this.freeUsed < max ? ++this.freeUsed : null);
  releaseFreeRewrite = () => {
    this.freeUsed--;
    this.releases++;
    return Promise.resolve();
  };
  recordUsage = (row: UsageRow) => {
    this.usageRows.push(row);
    return Promise.resolve();
  };
  recordEvent = (name: string) => {
    this.events.push(name);
    return Promise.resolve();
  };
}

const message = (text: string, stop_reason = "end_turn"): ApiMessage => ({
  content: [{ type: "text", text }],
  stop_reason,
  usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
});

let store: FakeStore;
let calls: unknown[];
let answers: (ApiMessage | Error)[];
const ai: Ai = (body) => {
  calls.push(body);
  const next = answers.shift();
  if (!next || next instanceof Error) return Promise.reject(next ?? new Error("no answer queued"));
  return Promise.resolve(next);
};
const deps = (): Deps => ({ store, ai, lockSecret: SECRET, now: () => NOW });
const aiRewrite = (text: string) => message(JSON.stringify({ rewrite: text }));
const goodAnswers = () => [message("Writes short, warm sentences with contractions and few commas."), aiRewrite(draft)];

beforeEach(() => {
  store = new FakeStore();
  calls = [];
  answers = goodAnswers();
});

describe("handleRewrite: the first free rewrite", () => {
  it("builds the voice profile, rewrites, cleans up and shows the result", async () => {
    const result = await handleRewrite(deps(), "u1", draft);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.text).toBe('Hi Jo,\n\nAlso, the colour scheme costs £450 and "we will leverage the data" as agreed. Thanks for organising it all.');
    expect(result.report.quotationsKept).toBe(1);
    expect(result.usage).toEqual({ tier: "free", used: 1, max: 3, shown: 2 });
    expect(store.events).toEqual(["free_rewrite_shown"]);
    expect(calls).toHaveLength(2);
  });

  it("records each call's real cost with the free tier, and never any text", async () => {
    await handleRewrite(deps(), "u1", draft);
    expect(store.usageRows.map((r) => [r.kind, r.tier, r.outcome, r.cost_usd, r.charged_words])).toEqual([
      ["style_profile", "free", "ok", "0.000200000", 0],
      ["rewrite", "free", "ok", "0.000200000", 0],
    ]);
    expect(JSON.stringify(store.usageRows)).not.toContain("Jo");
  });

  it("reuses the saved voice profile while the samples are unchanged", async () => {
    await handleRewrite(deps(), "u1", draft);
    store.freeUsed = 0;
    answers = [aiRewrite(draft)];
    calls = [];
    await handleRewrite(deps(), "u1", draft);
    expect(calls).toHaveLength(1);
    store.sampleList = [...store.sampleList, sample(4)];
    store.freeUsed = 0;
    answers = goodAnswers();
    calls = [];
    await handleRewrite(deps(), "u1", draft);
    expect(calls).toHaveLength(2);
  });

  it("removes hidden characters and chat citation markers from the draft before the AI sees it, and reports them", async () => {
    answers = [goodAnswers()[0]!, aiRewrite(draft)];
    const pasted = draft.replace("costs", "cos​ts") + " :contentReference[oaicite:3]{index=3}";
    const result = await handleRewrite(deps(), "u1", pasted);
    if (result.status !== "ok") throw new Error(result.status);
    expect(JSON.stringify(calls[1])).not.toContain("​");
    expect(JSON.stringify(calls[1])).not.toContain("oaicite");
    expect(result.summary).toContain("1 hidden character removed");
    expect(result.summary).toContain("1 chat citation marker removed");
  });

  it("flags numbers and quotations the AI changed, comparing before the clean-up", async () => {
    answers = [message("Plain profile with enough words to be accepted."), aiRewrite(draft.replace("£450", "£540").replace("leverage", "use"))];
    const result = await handleRewrite(deps(), "u1", draft);
    if (result.status !== "ok") throw new Error(result.status);
    expect(result.warnings.numbers).toEqual(["£450"]);
    expect(result.warnings.quotationsChanged).toEqual(["we will leverage the data"]);
  });
});

describe("handleRewrite: free rewrites 2 shown, then the third run but locked (launch decision 3)", () => {
  it("shows the second free rewrite in full", async () => {
    store.freeUsed = 1;
    const result = await handleRewrite(deps(), "u1", draft);
    expect(result.status).toBe("ok");
    expect(result.status === "ok" && result.usage).toEqual({ tier: "free", used: 2, max: 3, shown: 2 });
    expect(store.events).toEqual(["free_rewrite_shown"]);
  });

  it("sends only a masked preview and a sealed token that opens after subscribing", async () => {
    store.freeUsed = 2;
    const result = await handleRewrite(deps(), "u1", draft);
    expect(result.status).toBe("locked");
    if (result.status !== "locked") return;
    expect(result.preview.startsWith("Hi Jo,\n\n")).toBe(true);
    expect(result.preview.slice("Hi Jo,".length)).toMatch(/^[\s•]*$/);
    const sent = JSON.stringify(result);
    for (const word of ["colour", "£450", "organising", "Thanks"]) expect(sent).not.toContain(word);
    expect(result.expiresAt).toBe(new Date(NOW.getTime() + usage.lockedRewriteHours * 3_600_000).toISOString());
    expect(result.summary).toEqual(["1 stock phrase removed or reworded", "2 words changed to UK spelling", "1 quotation left exactly as written"]);
    expect(store.events).toEqual(["free_rewrite_locked"]);

    expect(await handleUnlock(deps(), "u1", result.token)).toEqual({ status: "not_subscribed" });
    store.period = { start: NOW, end: null };
    const unlocked = await handleUnlock(deps(), "u1", result.token);
    expect(unlocked).toEqual({ status: "ok", text: expect.stringContaining("the colour scheme costs £450") });
    expect(await handleUnlock(deps(), "someone-else", result.token)).toEqual({ status: "expired" });
  });

  it("stops after the third free rewrite without calling the AI", async () => {
    store.freeUsed = 3;
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "limit", limit: "free", resetsAt: null, usage: { tier: "free", used: 3, max: 3, shown: 2 } });
    expect(calls).toHaveLength(0);
  });

  it("stops when the free cost allowance is used up", async () => {
    store.spent.free = usage.free.allowanceUsd * 1e9;
    expect((await handleRewrite(deps(), "u1", draft)).status).toBe("limit");
  });
});

describe("handleRewrite: failures are not charged", () => {
  it.each([
    ["refused", message("", "refusal")],
    ["cut_off", message("{", "max_tokens")],
    ["malformed", message("Here you go!")],
  ])("gives the free rewrite back when the answer is %s", async (reason, bad) => {
    answers = [goodAnswers()[0]!, bad];
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "error", reason });
    expect(store.freeUsed).toBe(0);
    expect(store.usageRows.at(-1)?.outcome).toBe("error");
  });

  it("records a failed connection with no cost", async () => {
    answers = [new Error("network down")];
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "error", reason: "ai_unavailable" });
    expect(store.usageRows).toEqual([expect.objectContaining({ outcome: "error", cost_usd: "0.000000000" })]);
    expect(store.releases).toBe(1);
  });
});

describe("handleRewrite: paid credits by the word (Cam, 16 Oct)", () => {
  // A draft of a given length that the fake AI hands back unchanged.
  const longDraft = (words: number) => Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
  const answering = (text: string) => [message("Writes short, warm sentences with contractions and few commas."), aiRewrite(text)];

  beforeEach(() => {
    store.period = { start: new Date("2026-10-01T09:00:00Z"), end: new Date("2026-11-01T09:00:00Z") };
  });

  it("charges the draft's words, at least 50, and reports words used against what the credits allow", async () => {
    store.wordsToday = 500;
    store.wordsMonth = 4000;
    const result = await handleRewrite(deps(), "u1", draft);
    if (result.status !== "ok") throw new Error(result.status);
    // The draft is 19 words, so it is charged the 50-word minimum (half a credit).
    expect(result.usage).toEqual({
      tier: "paid",
      today: { used: 550, limit: 6000 },
      month: { used: 4050, limit: 30_000 },
      dayResetsAt: "2026-10-13T23:00:00.000Z",
      monthResetsAt: "2026-11-01T09:00:00.000Z",
    });
    // Today counts from London midnight, the month from the billing date.
    expect(store.wordsFrom.map((d) => d.toISOString())).toEqual(["2026-10-12T23:00:00.000Z", "2026-10-01T09:00:00.000Z"]);
    // The words sit on the rewrite's own row; the real cost is still recorded on every row.
    expect(store.usageRows.map((r) => [r.kind, r.tier, r.charged_words])).toEqual([
      ["style_profile", "paid", 0],
      ["rewrite", "paid", 50],
    ]);
    expect(store.usageRows.every((r) => Number(r.cost_usd) > 0)).toBe(true);
    expect(store.events).toEqual(["paid_rewrite"]);
    expect(store.freeUsed).toBe(0);
  });

  it("charges exactly the words above the minimum", async () => {
    answers = answering(longDraft(123));
    expect((await handleRewrite(deps(), "u1", longDraft(123))).status).toBe("ok");
    expect(store.usageRows.at(-1)?.charged_words).toBe(123);
    answers = [aiRewrite(longDraft(1000))];
    expect((await handleRewrite(deps(), "u1", longDraft(1000))).status).toBe("ok");
    expect(store.usageRows.at(-1)?.charged_words).toBe(1000);
  });

  it("stops when today's 60 credits (6,000 words) are used, with London midnight as the reset", async () => {
    store.wordsToday = 6000;
    expect(await handleRewrite(deps(), "u1", draft)).toMatchObject({ status: "limit", limit: "daily", resetsAt: "2026-10-13T23:00:00.000Z", needed: 50 });
    expect(calls).toHaveLength(0);
  });

  it("stops when the month's 300 credits (30,000 words) are used, with the billing date as the reset", async () => {
    store.wordsMonth = 30_000;
    expect(await handleRewrite(deps(), "u1", draft)).toMatchObject({ status: "limit", limit: "monthly", resetsAt: "2026-11-01T09:00:00.000Z" });
    expect(calls).toHaveLength(0);
  });

  it("refuses a draft with more words than are left, so nobody goes past what they were promised", async () => {
    store.wordsToday = 5600;
    expect(await handleRewrite(deps(), "u1", longDraft(401))).toMatchObject({ status: "limit", limit: "daily", needed: 401, usage: { today: { used: 5600, limit: 6000 } } });
    store.wordsToday = 0;
    store.wordsMonth = 29_700;
    expect(await handleRewrite(deps(), "u1", longDraft(301))).toMatchObject({ status: "limit", limit: "monthly", needed: 301 });
    expect(calls).toHaveLength(0);
    answers = answering(longDraft(300));
    expect((await handleRewrite(deps(), "u1", longDraft(300))).status).toBe("ok");
  });

  it("lets subscribers send drafts of up to 1,000 words", async () => {
    answers = answering(longDraft(1000));
    expect((await handleRewrite(deps(), "u1", longDraft(1000))).status).toBe("ok");
  });

  it("charges no words when the AI fails", async () => {
    answers = [goodAnswers()[0]!, message("", "refusal")];
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "error", reason: "refused" });
    expect(store.usageRows.map((r) => r.charged_words)).toEqual([0, 0]);
  });

  it("is not stopped by the free share alone, but is stopped by the shared daily ceiling (demo, 29 Oct)", async () => {
    store.freeGlobal = usage.globalFreeDailyCapUsd * 1e9;
    expect((await handleRewrite(deps(), "u1", draft)).status).toBe("ok");
    store.global = usage.globalDailyCapUsd * 1e9;
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "busy" });
  });
});

describe("handleRewrite: free drafts up to 300 words (Cam, 16 Oct)", () => {
  const longDraft = (words: number) => Array.from({ length: words }, (_, i) => `word${i}`).join(" ");

  it("refuses a longer free draft before any AI call or free rewrite is used", async () => {
    expect(await handleRewrite(deps(), "u1", longDraft(301))).toEqual({ status: "error", reason: "free_too_long" });
    expect(calls).toHaveLength(0);
    expect(store.freeUsed).toBe(0);
    answers = [message("Writes short, warm sentences with contractions and few commas."), aiRewrite(longDraft(300))];
    expect((await handleRewrite(deps(), "u1", longDraft(300))).status).toBe("ok");
  });
});

describe("handleRewrite: checks before any AI call", () => {
  it("refuses empty and too-long drafts", async () => {
    expect(await handleRewrite(deps(), "u1", "  ")).toEqual({ status: "error", reason: "empty" });
    expect(await handleRewrite(deps(), "u1", Array(1001).fill("w").join(" "))).toEqual({ status: "error", reason: "too_long" });
  });

  it("asks for samples until there are 3 with 150 words in total, the same as the free try (Cam, 16 Oct)", async () => {
    store.sampleList = [sample(1), sample(2)];
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "needs_samples" });
    store.sampleList = ["short", "short", "short"];
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "needs_samples" });
    const fifty = Array(50).fill("word").join(" ");
    store.sampleList = [fifty, fifty, Array(49).fill("word").join(" ")];
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "needs_samples" });
    store.sampleList = [fifty, fifty, fifty];
    expect((await handleRewrite(deps(), "u1", draft)).status).toBe("ok");
  });

  it("stops free rewrites once the shared daily AI ceiling is reached", async () => {
    store.global = usage.globalDailyCapUsd * 1e9;
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "busy" });
    expect(store.freeUsed).toBe(0);
  });

  it("stops test subscribers too once the shared daily AI ceiling is reached (demo: anyone can subscribe with the test card)", async () => {
    store.period = { start: new Date("2026-10-01T09:00:00Z"), end: new Date("2026-11-01T09:00:00Z") };
    store.global = usage.globalDailyCapUsd * 1e9;
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "busy" });
    expect(calls).toHaveLength(0);
  });

  it("respects the per-account rate limit", async () => {
    store.rateOk = false;
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "error", reason: "rate_limited" });
  });
});

describe("handleRewrite: abuse limits (T11)", () => {
  it("refuses a raw paste far over the character cap before cleaning it, even if it would clean to nothing (audit, 29 Oct)", async () => {
    const invisible = "​".repeat(limits.draftMaxChars * 2 + 1);
    expect(await handleRewrite(deps(), "u1", invisible)).toEqual({ status: "error", reason: "too_long" });
    expect(await handleTaste(deps(), { samples: [], draft: invisible, mode: "draft" })).toEqual({ status: "error", reason: "too_long" });
    expect(calls).toHaveLength(0);
  });

  it("refuses a draft over the character cap even when it is under the word cap", async () => {
    expect(await handleRewrite(deps(), "u1", "x".repeat(limits.draftMaxChars + 1))).toEqual({ status: "error", reason: "too_long" });
    expect(await handleRewrite(deps(), "u1", "日本語".repeat(5001))).toEqual({ status: "error", reason: "too_long" });
    expect(calls).toHaveLength(0);
  });

  it("stops an account for the rest of the London day after its billed failed calls reach the cap", async () => {
    store.billedFailures = limits.billedFailuresPerDay;
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "error", reason: "rate_limited" });
    expect(store.billedFailuresFrom?.toISOString()).toBe("2026-10-12T23:00:00.000Z");
    expect(calls).toHaveLength(0);
    expect(store.freeUsed).toBe(0);
    store.billedFailures = limits.billedFailuresPerDay - 1;
    expect((await handleRewrite(deps(), "u1", draft)).status).toBe("ok");
  });

  it("allows only a few rewrites a minute per account, so parallel requests cannot race past the limits", async () => {
    await handleRewrite(deps(), "u1", draft);
    expect(store.rateCalls).toContainEqual(["rewrite-burst:u1", limits.burst.windowSeconds, limits.burst.max]);
    store.rateBlocked = ["rewrite-burst:"];
    store.freeUsed = 0;
    calls = [];
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "error", reason: "rate_limited" });
    expect(calls).toHaveLength(0);
  });

  it("stops free rewrites at their share of the daily ceiling while paid rewrites carry on", async () => {
    store.freeGlobal = usage.globalFreeDailyCapUsd * 1e9;
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "busy" });
    expect(calls).toHaveLength(0);
    expect(store.freeUsed).toBe(0);
    store.period = { start: new Date("2026-10-01T09:00:00Z"), end: new Date("2026-11-01T09:00:00Z") };
    expect((await handleRewrite(deps(), "u1", draft)).status).toBe("ok");
  });
});

describe("handleRewrite: mock mode (test project)", () => {
  it("never calls the AI, records mock rows and bumps the first number", async () => {
    store.mode = "mock";
    const result = await handleRewrite(deps(), "u1", draft);
    expect(calls).toHaveLength(0);
    if (result.status !== "ok") throw new Error(result.status);
    expect(result.text).toContain("£451");
    expect(result.warnings.numbers).toEqual(["£450"]);
    expect(store.usageRows.map((r) => r.outcome)).toEqual(["mock", "mock"]);
  });

  it("can be made to refuse, to test the error path", async () => {
    store.mode = "mock";
    expect(await handleRewrite(deps(), "u1", `${draft} MOCK_REFUSE`)).toEqual({ status: "error", reason: "refused" });
  });
});

describe("handleRewrite: notes mode (Q4)", () => {
  const notes = "cant make football thurs, covering a late shift. sat instead? pitches free 7pm, £6 each, ill book";
  const system = (body: unknown) => (body as { system: { text: string }[] }).system[0]?.text ?? "";

  it("sends the notes rules and says which mode it ran", async () => {
    answers = [message("Writes short, warm sentences with contractions and few commas."), aiRewrite("Can't make football on Thursday, I'm covering a late shift. Saturday instead? Pitches are free at 7pm, £6 each. I'll book.")];
    const result = await handleRewrite(deps(), "u1", notes, "notes");
    expect(result).toMatchObject({ status: "ok", mode: "notes" });
    expect(system(calls[1])).toContain("own rough notes");
    expect(system(calls[1])).not.toContain("never copy a run of four or more words");
  });

  it("checks meaning against the notes", async () => {
    answers = [message("Writes short, warm sentences with contractions and few commas."), aiRewrite("Can't make football on Thursday. Saturday instead at 7pm? It's £5 each and I'll book it, as I'm covering a late shift.")];
    const result = await handleRewrite(deps(), "u1", notes, "notes");
    expect(result.status === "ok" && result.warnings.numbers).toEqual(["£6"]);
  });

  it("defaults to draft mode, and locks a notes rewrite the same way as a draft", async () => {
    const drafted = await handleRewrite(deps(), "u1", draft);
    expect(drafted).toMatchObject({ status: "ok", mode: "draft" });
    expect(system(calls[1])).toContain("never copy a run of four or more words");
    // The third free rewrite is the locked one (launch decision 3).
    store.freeUsed = 2;
    answers = [aiRewrite("Can't make football Thursday, covering a late shift. Saturday instead? Pitches free at 7pm, £6 each, I'll book.")];
    expect(await handleRewrite(deps(), "u1", notes, "notes")).toMatchObject({ status: "locked", mode: "notes" });
  });

  it("works in mock mode", async () => {
    store.mode = "mock";
    expect(await handleRewrite(deps(), "u1", notes, "notes")).toMatchObject({ status: "ok", mode: "notes", text: expect.stringContaining("free 8pm") });
  });
});

describe("handleRewrite: slang only from the samples (Q5)", () => {
  const system = (body: unknown) => (body as { system: { text: string }[] }).system[0]?.text ?? "";

  const profileAnswer = () => message("Writes short, warm sentences with contractions and few commas.");
  const rewriteAs = (text: string, formal: boolean) => message(JSON.stringify({ keep: [], formal, rewrite: text }));

  it("tells the AI exactly which slang words the person's samples use at least twice", async () => {
    store.sampleList = store.sampleList.map((s, i) => (i === 0 ? `${s} tbf it was gonna be fine, yeah` : i === 1 ? `${s} gonna rain, yeah` : s));
    await handleRewrite(deps(), "u1", draft);
    expect(system(calls[1])).toContain("the person's own writing often uses only these: gonna, yeah.");
  });

  it("says use none when the samples have none often", async () => {
    await handleRewrite(deps(), "u1", draft);
    expect(system(calls[1])).toContain("the person's own writing uses none often, so use none.");
  });

  it("takes out slang the AI added anyway, and says so", async () => {
    answers = [profileAnswer(), rewriteAs(`${draft} Cheers mate, lol.`, false)];
    const result = await handleRewrite(deps(), "u1", draft);
    expect(result.status === "ok" && result.text.endsWith(" Thanks.")).toBe(true);
    expect(result.status === "ok" && result.summary).toContain("3 slang words taken out");
  });

  it("keeps slang the person's samples use often in an informal message", async () => {
    store.sampleList = store.sampleList.map((s, i) => (i === 0 ? `${s} cheers for that, cheers` : s));
    answers = [profileAnswer(), rewriteAs(`${draft} Cheers!`, false)];
    const result = await handleRewrite(deps(), "u1", draft);
    expect(result.status === "ok" && result.text.endsWith(" Cheers!")).toBe(true);
    expect(result.status === "ok" && result.summary.some((line) => line.includes("slang"))).toBe(false);
  });

  for (const [when, answer] of [
    ["says the message is formal", () => rewriteAs(`${draft} Cheers!`, true)],
    ["does not say", () => aiRewrite(`${draft} Cheers!`)],
  ] as const) {
    it(`takes the person's own slang out when the AI ${when}`, async () => {
      store.sampleList = store.sampleList.map((s, i) => (i === 0 ? `${s} cheers for that, cheers` : s));
      answers = [profileAnswer(), answer()];
      const result = await handleRewrite(deps(), "u1", draft);
      expect(result.status === "ok" && result.text.endsWith(" Thanks!")).toBe(true);
      expect(result.status === "ok" && result.summary).toContain("1 slang word taken out");
    });
  }
});

describe("parseRequest", () => {
  it("accepts a rewrite in either mode, defaulting to draft, and an unlock", () => {
    expect(parseRequest({ action: "rewrite", draft: "Hi" })).toEqual({ action: "rewrite", draft: "Hi", mode: "draft" });
    expect(parseRequest({ action: "rewrite", draft: "Hi", mode: "draft" })).toEqual({ action: "rewrite", draft: "Hi", mode: "draft" });
    expect(parseRequest({ action: "rewrite", draft: "Hi", mode: "notes" })).toEqual({ action: "rewrite", draft: "Hi", mode: "notes" });
    expect(parseRequest({ action: "unlock", token: "t" })).toEqual({ action: "unlock", token: "t" });
  });

  it("refuses anything else", () => {
    for (const bad of [null, "rewrite", [], { action: "rewrite" }, { action: "rewrite", draft: 3 }, { action: "rewrite", draft: "Hi", mode: "essay" }, { action: "rewrite", draft: "Hi", mode: null }, { action: "unlock" }, { action: "delete", draft: "Hi" }]) {
      expect(parseRequest(bad)).toBeNull();
    }
  });
});

describe("draft types (Cam's hands-on test, 15 Oct)", () => {
  const casual = "its about 1,708 metres wide. the river is kinda wide bc of the rains. i think so, hope that's ok";
  const formalDraft = "It is about 1,708 metres wide. The river is wide because of the rains. I think so, I hope that is fine.";

  it("parses a draft type, and refuses an unknown one", () => {
    expect(parseRequest({ action: "rewrite", draft: "Hi", kind: "email" })).toEqual({ action: "rewrite", draft: "Hi", mode: "draft", kind: "email" });
    expect(parseRequest({ action: "rewrite", draft: "Hi", kind: "essay" })).toBeNull();
  });

  it("tells the AI the type, and fixes capitals, I, apostrophes and abbreviations after it for the careful types", async () => {
    answers = [goodAnswers()[0]!, aiRewrite(casual)];
    const result = await handleRewrite(deps(), "u1", formalDraft, "draft", "work");
    if (result.status !== "ok") throw new Error(result.status);
    expect(JSON.stringify(calls[1])).toContain("The person says this is a piece of work");
    expect(result.text).toBe("It's about 1,708 metres wide. The river is kind of wide because of the rains. I think so, hope that's ok");
    expect(result.kind).toBe("work");
    expect(result.summary.some((line) => /capitals, apostrophes or abbreviations fixed/.test(line))).toBe(true);
  });

  it("leaves a Text as casual as the AI wrote it", async () => {
    answers = [goodAnswers()[0]!, aiRewrite(casual)];
    const result = await handleRewrite(deps(), "u1", formalDraft, "draft", "text");
    if (result.status !== "ok") throw new Error(result.status);
    expect(result.text.startsWith("its about")).toBe(true);
  });

  it("without a type, sends the request exactly as before", async () => {
    await handleRewrite(deps(), "u1", draft);
    expect(JSON.stringify(calls[1])).not.toContain("The person says this is");
  });

  it("shows added content and changed claims in Check these, but never in a locked result", async () => {
    const added = `${draft} love you 😂`;
    answers = [goodAnswers()[0]!, aiRewrite(added)];
    const shown = await handleRewrite(deps(), "u1", draft, "draft", "text");
    if (shown.status !== "ok") throw new Error(shown.status);
    expect(shown.warnings.added).toContain("😂");
    answers = [aiRewrite(added)];
    store.freeUsed = 2;
    const locked = await handleRewrite(deps(), "u1", draft, "draft", "text");
    if (locked.status !== "locked") throw new Error(locked.status);
    expect(locked.warnings.added).toEqual([]);
    expect(JSON.stringify(locked)).not.toContain("love you");
    expect(locked.summary.some((line) => /to check once it's unlocked/.test(line))).toBe(true);
  });
});

describe("added content is checked on the final text", () => {
  it("never quotes slang the fixes took out", async () => {
    answers = [goodAnswers()[0]!, aiRewrite(`${draft} The setup is odd, tbf.`)];
    const result = await handleRewrite(deps(), "u1", draft, "draft", "article");
    if (result.status !== "ok") throw new Error(result.status);
    expect(result.text).not.toContain("tbf");
    expect(JSON.stringify(result.warnings.added)).not.toContain("tbf");
  });
});

describe("handleTaste: one free rewrite without an account (R1)", () => {
  const answers3 = [sample(1), sample(2), sample(3)];

  it("builds a voice from the visitor's answers, rewrites, records the cost with no account and logs taste_completed", async () => {
    const result = await handleTaste(deps(), { samples: answers3, draft, mode: "draft", kind: "email" });
    if (result.status !== "ok") throw new Error(result.status);
    expect(result.text).toContain("colour");
    expect(result.kind).toBe("email");
    expect(store.usageRows.map((r) => [r.user_id, r.tier, r.kind])).toEqual([
      [null, "free", "style_profile"],
      [null, "free", "rewrite"],
    ]);
    expect(store.events).toEqual(["taste_completed"]);
    expect(store.profile).toBeNull();
  });

  it("caps the free try at 300 words, like free accounts", async () => {
    const long = Array.from({ length: 301 }, (_, i) => `word${i}`).join(" ");
    expect(await handleTaste(deps(), { samples: answers3, draft: long, mode: "draft" })).toEqual({ status: "error", reason: "free_too_long" });
    expect(calls).toHaveLength(0);
  });

  it("needs at least 3 answers with enough words, and refuses too many or too long", async () => {
    expect(await handleTaste(deps(), { samples: answers3.slice(0, 2), draft, mode: "draft" })).toEqual({ status: "needs_samples" });
    expect(await handleTaste(deps(), { samples: ["short", "short", "short"], draft, mode: "draft" })).toEqual({ status: "needs_samples" });
    expect(await handleTaste(deps(), { samples: Array(6).fill(sample(1)), draft, mode: "draft" })).toEqual({ status: "error", reason: "too_long" });
    expect(await handleTaste(deps(), { samples: answers3, draft: "x".repeat(limits.draftMaxChars + 1), mode: "draft" })).toEqual({ status: "error", reason: "too_long" });
    expect(calls).toHaveLength(0);
  });

  it("stops at the free share of the daily ceiling and at the hourly limit for everyone", async () => {
    store.freeGlobal = usage.globalFreeDailyCapUsd * 1e9;
    expect(await handleTaste(deps(), { samples: answers3, draft, mode: "draft" })).toEqual({ status: "busy" });
    store.freeGlobal = 0;
    store.rateBlocked = ["taste-global"];
    expect(await handleTaste(deps(), { samples: answers3, draft, mode: "draft" })).toEqual({ status: "error", reason: "rate_limited" });
    expect(calls).toHaveLength(0);
  });

  it("parses a taste request with its answers", () => {
    expect(parseRequest({ action: "taste", draft: "Hi", samples: ["a", "b", "c"], kind: "text" })).toEqual({ action: "taste", draft: "Hi", mode: "draft", samples: ["a", "b", "c"], kind: "text" });
    expect(parseRequest({ action: "taste", draft: "Hi", samples: "nope" })).toBeNull();
    expect(parseRequest({ action: "taste", draft: "Hi", samples: [1, 2, 3] })).toBeNull();
  });
});

describe("British or American spelling (Cam, 16 Oct)", () => {
  const british = 'Hi Jo,\n\nThe colour scheme costs £450 and "the colour is final" as agreed. Thanks for organising it all.';

  it("parses a spelling choice, defaults to none, and refuses an unknown one", () => {
    expect(parseRequest({ action: "rewrite", draft: "Hi", spelling: "us" })).toEqual({ action: "rewrite", draft: "Hi", mode: "draft", spelling: "us" });
    expect(parseRequest({ action: "rewrite", draft: "Hi", kind: "email", spelling: "uk" })).toEqual({ action: "rewrite", draft: "Hi", mode: "draft", kind: "email", spelling: "uk" });
    expect(parseRequest({ action: "rewrite", draft: "Hi", spelling: "fr" })).toBeNull();
    expect(parseRequest({ action: "taste", draft: "Hi", samples: ["a", "b", "c"], spelling: "us" })).toEqual({ action: "taste", draft: "Hi", mode: "draft", samples: ["a", "b", "c"], spelling: "us" });
    expect(parseRequest({ action: "taste", draft: "Hi", samples: ["a", "b", "c"], spelling: 1 })).toBeNull();
  });

  it("asks the AI for American English and cleans up to American spelling, leaving quotations alone", async () => {
    answers = [goodAnswers()[0]!, aiRewrite(british)];
    const result = await handleRewrite(deps(), "u1", british, "draft", "email", "us");
    if (result.status !== "ok") throw new Error(result.status);
    expect(JSON.stringify(calls[1])).toContain("Write in American English");
    expect(JSON.stringify(calls[1])).not.toContain("Write in British English");
    expect(result.text).toContain("The color scheme");
    expect(result.text).toContain("organizing");
    expect(result.text).toContain('"the colour is final"');
    expect(result.summary).toContain("2 words changed to American spelling");
  });

  it("stays British when no spelling is given, with the request exactly as before", async () => {
    await handleRewrite(deps(), "u1", draft);
    const before = JSON.stringify(calls[1]);
    calls = [];
    answers = [aiRewrite(draft)];
    await handleRewrite(deps(), "u1", draft, "draft", undefined, "uk");
    expect(JSON.stringify(calls[0])).toBe(before);
    expect(before).toContain("Write in British English");
  });

  it("works for the free taste and in mock mode", async () => {
    store.mode = "mock";
    const result = await handleTaste(deps(), { samples: [sample(1), sample(2), sample(3)], draft: british, mode: "draft", spelling: "us" });
    if (result.status !== "ok") throw new Error(result.status);
    expect(result.text).toContain("The color scheme costs £451");
  });
});

describe("hard daily AI ceiling: spend is reserved before the calls (audit, 29 Oct)", () => {
  it("reserves a worst-case amount for the request under the daily cap, and releases it afterwards", async () => {
    expect((await handleRewrite(deps(), "u1", draft)).status).toBe("ok");
    expect(store.reserveCalls).toHaveLength(1);
    expect(store.reserveCalls[0]!.cap).toBe(usage.globalDailyCapUsd * 1e9);
    expect(store.reserveCalls[0]!.amount).toBeGreaterThan(0);
    expect(store.reservations.size).toBe(0);
  });

  it("refuses with busy, before any AI call or free rewrite is used, when the reservation would pass the cap", async () => {
    store.global = usage.globalDailyCapUsd * 1e9 - 1;
    expect(await handleRewrite(deps(), "u1", draft)).toEqual({ status: "busy" });
    expect(await handleTaste(deps(), { samples: [sample(1), sample(2), sample(3)], draft, mode: "draft" })).toEqual({ status: "busy" });
    expect(calls).toHaveLength(0);
    expect(store.freeUsed).toBe(0);
  });

  it("releases the reservation when the AI call fails", async () => {
    answers = [new Error("network down")];
    expect((await handleRewrite(deps(), "u1", draft)).status).toBe("error");
    expect(store.reservations.size).toBe(0);
  });

  it("never records more than the cap, however many requests arrive at once", async () => {
    // Each call really costs its reservation's worth, and usage is written only after a delay.
    const worst = await (async () => {
      await handleRewrite(deps(), "probe", draft);
      return store.reserveCalls[0]!.amount;
    })();
    store.reserveCalls = [];
    store.global = 0;
    store.recordUsage = async (row) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      store.usageRows.push(row);
      store.global += worst / 2;
    };
    store.claimFreeRewrite = () => Promise.resolve(1);
    const each: Ai = (body) =>
      Promise.resolve((body as { output_config?: { format?: unknown } }).output_config?.format ? aiRewrite(draft) : message("Writes short, warm sentences with contractions and few commas."));
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => handleRewrite({ ...deps(), ai: each }, `u${i}`, draft)));
    expect(results.filter((r) => r.status === "busy").length).toBeGreaterThan(0);
    expect(store.global).toBeLessThanOrEqual(usage.globalDailyCapUsd * 1e9);
  });
});
