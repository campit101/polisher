// Limits the Edge Function enforces. They mirror src/config/site.ts (the site copy quotes them) and
// src/lib/billing.ts; tests/unit/rewrite-limits.test.ts fails if they ever differ.
export const limits = {
  // 1,000 words for accuracy and AI cost (Cam, 16 Oct; was 1,500).
  draftMaxWords: 1000,
  // Words are counted between spaces, so text without spaces needs a character cap as well (T11).
  draftMaxChars: 10000,
  samplesMin: 3,
  // The same amount of writing as the free try (Cam, 16 Oct; was 300).
  samplesMinTotalWords: 150,
  sampleMaxWords: 2000,
  sampleMaxChars: 20000,
  // Per account: rewrites and unlock attempts per hour.
  rewritesPerHour: 30,
  unlocksPerHour: 20,
  // At most a few rewrites a minute, so parallel requests cannot race past the spend checks (T11).
  burst: { windowSeconds: 60, max: 4 },
  // Failed answers are free for the user but billed to Polisher; after this many in a London day
  // the account waits until midnight (T11).
  billedFailuresPerDay: 3,
  // R1 free taste without an account: at least 3 of the 5 own-words questions answered, with enough
  // words to show a voice; at most this many tastes an hour across everyone (the site also limits
  // each connection and asks for a bot check).
  taste: { minAnswers: 3, maxAnswers: 5, minWords: 150, globalPerHour: 120 },
} as const;

/** Subscription statuses that get the paid allowance. Mirrors PAID_STATUSES in src/lib/billing.ts. */
export const paidStatuses = ["active", "trialing", "past_due"] as const;

export const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;
